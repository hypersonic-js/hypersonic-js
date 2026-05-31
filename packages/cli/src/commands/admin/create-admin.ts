import type { Command } from 'commander'
import { prompt as defaultPrompt, type PromptFn } from '../../utils/prompt.js'

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

/** Injectable dependency bag — swap out in tests to avoid real I/O. */
export interface CreateAdminDeps {
  betterAuth(opts: unknown): BetterAuthInstance
  prismaAdapter(client: unknown, opts: { provider: string }): unknown
  adminPlugin(): unknown
  PrismaClient: new (opts?: { datasourceUrl?: string }) => { $disconnect(): Promise<void> }
  detectProvider(url: string): string
}

import { logger } from '../../utils/logger.js'

// ── Implementation ────────────────────────────────────────────────────────────

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
    detectProvider: core.detectProvider as CreateAdminDeps['detectProvider'],
  }
}

/**
 * Core logic for creating the first admin user.
 * Accepts an optional `deps` parameter so unit tests can inject mocks
 * without touching the filesystem or a real database.
 */
export async function runCreateAdmin(
  opts: CreateAdminOptions,
  deps?: CreateAdminDeps,
): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
  const secret = process.env['BETTER_AUTH_SECRET']

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Add it to your .env file.')
  }
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is not set. Add it to your .env file.')
  }

  const { betterAuth, prismaAdapter, adminPlugin, PrismaClient, detectProvider } =
    deps ?? (await loadDeps())

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })

  try {
    const auth = betterAuth({
      secret,
      database: prismaAdapter(prisma, { provider: detectProvider(databaseUrl) }),
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
 * Usage:
 *   hypersonic admin create-admin
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