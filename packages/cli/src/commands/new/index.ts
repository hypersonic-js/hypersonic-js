import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Command } from 'commander'
import { prompt as defaultPrompt, type PromptFn } from '../../utils/prompt.js'
import { logger } from '../../utils/logger.js'
import { generateFiles, type GenerateFilesDeps } from './generate-files.js'
import { runSetup, type RunSetupDeps } from './run-setup.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface NewCommandDeps {
  prompt: PromptFn
  readdirSync: (path: string) => string[]
  mkdirSync: (path: string, opts: { recursive: boolean }) => void
  generateFiles: typeof generateFiles
  runSetup: typeof runSetup
  randomBytes: (size: number) => Buffer
  cwd: () => string
}

// ── Dependency loader ──────────────────────────────────────────────────────

function loadDeps(): NewCommandDeps {
  return {
    prompt: defaultPrompt,
    readdirSync,
    mkdirSync: (p, opts) => mkdirSync(p, opts),
    generateFiles,
    runSetup,
    randomBytes,
    cwd: () => process.cwd(),
  }
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Registers the `hypersonic new` top-level command.
 *
 * Fully interactive — no arguments accepted. Prompts:
 *   1. Directory choice  (new subdirectory | current directory)
 *   2. Warning + confirm if current directory is not empty
 *   3. Project name      (always required)
 *
 * Then generates all project files, runs npm install, runs Prisma migrations,
 * scaffolds the admin dashboard, generates admin metadata, and finally runs
 * `hypersonic admin create-admin` interactively so the user creates their
 * first admin account before the command exits.
 */
export function registerNewCommand(
  program: Command,
  deps: NewCommandDeps = loadDeps(),
): void {
  program
    .command('new')
    .description('Scaffold a new Hypersonic.js project interactively')
    .action(async () => {
      const {
        prompt,
        readdirSync: readdir,
        mkdirSync: mkdir,
        generateFiles: doGenerateFiles,
        runSetup: doRunSetup,
        randomBytes: rb,
        cwd,
      } = deps

      // ── 1. Directory choice ──────────────────────────────────────────────
      logger.info('Where would you like to create your project?')
      logger.info('  1. Create a new directory')
      logger.info('  2. Use current directory')
      const dirChoice = await prompt('Choice [1]: ')
      const useCurrentDir = dirChoice.trim() === '2'

      // ── 2. Warn if current directory is not empty ────────────────────────
      if (useCurrentDir) {
        const existing = readdir(cwd())
        if (existing.length > 0) {
          logger.warn(
            `Current directory is not empty (${existing.length} file(s) found).`,
          )
          const confirm = await prompt('Continue anyway? [y/N]: ')
          if (confirm.trim().toLowerCase() !== 'y') {
            logger.info('Aborted.')
            return
          }
        }
      }

      // ── 3. Project name (mandatory) ──────────────────────────────────────
      const rawName = await prompt('Project name: ')
      const projectName = rawName.trim()
      if (!projectName) {
        logger.error('Project name is required.')
        process.exit(1)
      }

      // ── 4. Resolve project directory ─────────────────────────────────────
      const projectDir = useCurrentDir ? cwd() : join(cwd(), projectName)
      if (!useCurrentDir) {
        mkdir(projectDir, { recursive: true })
      }

      // ── 5. Generate project files ─────────────────────────────────────────
      const secret = rb(32).toString('hex')
      logger.info(`\nCreating project in ${projectDir}…`)
      await doGenerateFiles({ projectDir, projectName, secret })
      logger.success('Project files written.')

      // ── 6. Run setup steps ────────────────────────────────────────────────
      await doRunSetup({ projectDir })

      // ── 7. Done ───────────────────────────────────────────────────────────
      logger.success('\nYour project is ready!')
      if (!useCurrentDir) {
        logger.info(`\n  cd ${projectName}`)
      }
      logger.info('  npm run dev\n')
    })
}