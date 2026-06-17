import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { scaffoldAdmin } from '@hypersonic-js/admin'
import { runGenerateMeta } from '../admin/generate-meta.js'
import { logger } from '../../utils/logger.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunSetupOptions {
  projectDir: string
}

/** Runs a shell command with the given working directory. */
export type ExecFn = (command: string, cwd: string) => void

export interface RunSetupDeps {
  exec: ExecFn
  scaffoldAdmin: (opts: { targetDir: string; force: boolean }) => Promise<{
    written: string[]
    skipped: string[]
  }>
  generateAdminMeta: (schemaPath: string, outputPath: string) => Promise<void>
}

// ── Dependency loader ──────────────────────────────────────────────────────

async function loadDeps(): Promise<RunSetupDeps> {
  const { getDMMF } = await import('@prisma/get-dmmf')

  return {
    exec: (command, cwd) => execSync(command, { cwd, stdio: 'inherit' }),

    scaffoldAdmin,

    generateAdminMeta: async (schemaPath, outputPath) => {
      await runGenerateMeta(
        { schema: schemaPath, output: outputPath },
        {
          getDMMF,
          readFile: (p) => readFileSync(p, 'utf-8'),
          writeFile: (p, c) => writeFileSync(p, c),
        },
      )
    },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Runs all post-generation setup steps in order:
 *
 * 1. npm install         — installs project dependencies
 * 2. prisma migrate dev  — creates the SQLite database and runs migrations
 * 3. prisma generate     — generates the Prisma client from the schema
 * 4. admin scaffold      — copies admin React page components into the project
 * 5. admin generate-meta — generates prisma/admin-meta.json from the schema
 * 6. admin create-admin  — interactive: the user creates their admin account
 *
 * Steps 1–3 run as child processes (stdio: inherit so the user sees output).
 * Steps 4–5 call the existing CLI functions directly to avoid a second spawn.
 * Step 6 spawns `hypersonic admin create-admin` in the project directory so
 * it resolves its own node_modules (better-auth, @prisma/client, etc.) from
 * the newly-installed project rather than from the CLI's install location.
 */
export async function runSetup(
  opts: RunSetupOptions,
  deps?: RunSetupDeps,
): Promise<void> {
  // `await` cannot be used in a default parameter expression of an async
  // function — it is a syntax error. Resolve lazily inside the body instead.
  const { exec, scaffoldAdmin: doScaffold, generateAdminMeta } = deps ?? (await loadDeps())
  const { projectDir } = opts

  const pagesDir = join(projectDir, 'resources/js/Pages')
  const schemaPath = join(projectDir, 'prisma/schema.prisma')
  const metaPath = join(projectDir, 'prisma/admin-meta.json')

  // ── 1. Install dependencies ──────────────────────────────────────────────
  logger.info('Installing dependencies…')
  exec('npm install', projectDir)

  // ── 2. Run database migrations ───────────────────────────────────────────
  logger.info('Running database migrations…')
  exec('npx prisma migrate dev --name init', projectDir)

  // ── 3. Generate Prisma client ────────────────────────────────────────────
  logger.info('Generating Prisma client…')
  exec('npx prisma generate', projectDir)

  // ── 4. Scaffold admin pages ──────────────────────────────────────────────
  logger.info('Scaffolding admin pages…')
  const scaffoldResult = await doScaffold({ targetDir: pagesDir, force: false })
  for (const file of scaffoldResult.written) {
    logger.success(`Written  resources/js/Pages/Admin/${file}`)
  }

  // ── 5. Generate admin metadata ───────────────────────────────────────────
  logger.info('Generating admin metadata…')
  await generateAdminMeta(schemaPath, metaPath)
  logger.success('Admin meta written to prisma/admin-meta.json')

  // ── 6. Create admin user (interactive subprocess) ────────────────────────
  logger.info('Creating your admin account…')
  exec('npx hypersonic admin create-admin', projectDir)
}