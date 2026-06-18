import type { Command } from 'commander'
import { logger } from '../../utils/logger.js'

/**
 * Registers the `hypersonic admin scaffold` subcommand.
 *
 * Usage:
 *   hypersonic admin scaffold [--target-dir <dir>] [--force]
 */
export function registerAdminScaffold(adminCommand: Command): void {
  adminCommand
    .command('scaffold')
    .description(
      'Scaffold the three generic admin page components (Dashboard, ModelIndex, ModelForm) ' +
        'into your project. These components are schema-driven and never need to be regenerated.',
    )
    .option(
      '--target-dir <dir>',
      'Directory to scaffold admin pages into',
      'resources/js/Pages',
    )
    .option('-f, --force', 'Overwrite existing files', false)
    .action(async (opts: { targetDir: string; force: boolean }) => {
      const { scaffoldAdmin } = await import('@hypersonic-js/admin')
      logger.info(`Scaffolding admin pages into ${opts.targetDir}/Admin/…`)

      const result = await scaffoldAdmin({
        targetDir: opts.targetDir,
        force: opts.force,
      })

      for (const file of result.written) {
        logger.success(`Written  ${opts.targetDir}/Admin/${file}`)
      }

      for (const file of result.skipped) {
        logger.warn(`Skipped  ${opts.targetDir}/Admin/${file} (already exists — use --force to overwrite)`)
      }

      if (result.written.length === 0 && result.skipped.length === 0) {
        logger.warn('No files written. This is unexpected — please file a bug.')
      }
    })
}
