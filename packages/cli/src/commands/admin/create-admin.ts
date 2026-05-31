import type { Command } from 'commander'

import { prompt as defaultPrompt, type PromptFn } from '../../utils/prompt.js'
import { logger } from '../../utils/logger.js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CreateAdminOptions {
  email: string
  name: string
  password: string
}

/** Minimal shape of the auth API we need from Better Auth. */
interface BetterAuthApi {
  createUser(opts: {
    body: { email: string; name: string; password: string; role: string }
  }): Promise<{ user: { id: string; email: string } }>
}

interface BetterAuthInstance {
  api: BetterAuthApi
}

interface LoadedConfig {
  config: { database: { provider: string } }
  env: { DATABASE_URL: string; BETTER_AUTH_SECRET: string }
}

/** Injectable dependency bag — swap out in tests to avoid real I/O. */
export interface CreateAdminDeps {
  betterAuth(opts: unknown): BetterAuthInstance
  prismaAdapter(client: unknown, opts: { provider: string }): unknown
  adminPlugin(): unknown
  /** Prisma v7 requires an adapter — never constructed bare. */
  PrismaClient: new (opts: { adapter: unknown }) => { $disconnect(): Promise<void> }
  /** Reads hypersonic.config.ts and validates env — throws if either is missing. */
  loadConfig(): Promise<LoadedConfig>
  /** Creates the driver adapter for the given provider and DATABASE_URL. */
  createDatabaseAdapter(provider: string, databaseUrl: string): Promise<unknown>
}

// ── Dependency loader ────────────────────────────────────────────────────────

async function loadDeps(): Promise<CreateAdminDeps> {
  const [ba, pa, pl, pc, core] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/plugins'),
    import('@prisma/client'),
    import('@hypersonic-js/core'),
  ])
  return {
    betterAuth: ba.betterAuth as unknown as CreateAdminDeps['betterAuth'],
    prismaAdapter: pa.prismaAdapter as CreateAdminDeps['prismaAdapter'],
    adminPlugin: (pl as { admin: () => unknown }).admin,
    PrismaClient: pc.PrismaClient as unknown as CreateAdminDeps['PrismaClient'],
    loadConfig: () => (core.loadConfig as () => Promise<LoadedConfig>)(),
    createDatabaseAdapter: core.createDatabaseAdapter as CreateAdminDeps['createDatabaseAdapter'],
  }
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Core logic for creating the first admin user.
 * Accepts an optional `deps` parameter so unit tests can inject mocks
 * without touching the filesystem or a real database.
 *
 * Environment validation and config loading are handled by `loadConfig` —
 * it will throw a descriptive error if DATABASE_URL, BETTER_AUTH_SECRET, or
 * hypersonic.config.ts are missing.
 */
export async function runCreateAdmin(
  opts: CreateAdminOptions,
  deps?: CreateAdminDeps,
): Promise<void> {
  const { betterAuth, prismaAdapter, adminPlugin, PrismaClient, loadConfig, createDatabaseAdapter } =
    deps ?? (await loadDeps())

  const { config, env } = await loadConfig()

  const adapter = await createDatabaseAdapter(config.database.provider, env.DATABASE_URL)
  const prisma = new PrismaClient({ adapter })

  try {
    const auth = betterAuth({
      secret: env.BETTER_AUTH_SECRET,
      database: prismaAdapter(prisma, { provider: config.database.provider }),
      emailAndPassword: { enabled: true },
      plugins: [adminPlugin()],
    })

    logger.info(`Creating admin user ${opts.email}…`)

    await auth.api.createUser({
      body: { email: opts.email, name: opts.name, password: opts.password, role: 'admin' },
    })

    logger.success(`Admin user created: ${opts.email}`)
  } finally {
    await prisma.$disconnect()
  }
}

// ── Command registration ──────────────────────────────────────────────────────

/**
 * Registers the `hypersonic admin create-admin` subcommand.
 *
 * Prompts interactively for email, name, and password (password is hidden).
 * Loads the project's .env file automatically before running so
 * DATABASE_URL and BETTER_AUTH_SECRET are available without the caller
 * having to export them manually.
 *
 * Optional `promptFn` and `deps` can be injected for testing without
 * touching stdin or a real database.
 */
export function registerCreateAdmin(
  adminCommand: Command,
  promptFn?: PromptFn,
  deps?: CreateAdminDeps,
): void {
  const ask = promptFn ?? defaultPrompt

  adminCommand
    .command('create-admin')
    .description(
      'Create the initial admin user. Run once after your first migration to bootstrap ' +
        'admin access. Subsequent admins can be promoted through the dashboard.',
    )
    .action(async () => {
      // Load .env from the project root so DATABASE_URL and BETTER_AUTH_SECRET
      // are available when the CLI is run from the project directory.
      const { config } = await import('dotenv')
      config()

      const email = await ask('Email: ')
      const name = await ask('Name: ')
      const password = await ask('Password: ', true)

      await runCreateAdmin({ email, name, password }, deps)
    })
}