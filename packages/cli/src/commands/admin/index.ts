import type { Command } from 'commander'
import { registerAdminScaffold } from './scaffold.js'
import { registerCreateAdmin } from './create-admin.js'
import { registerGenerateMeta } from './generate-meta.js'

/**
 * Registers the `hypersonic admin` command group and all its subcommands.
 */
export function registerAdminCommands(program: Command): void {
  const admin = program
    .command('admin')
    .description('Admin dashboard commands')

  registerAdminScaffold(admin)
  registerCreateAdmin(admin)
  registerGenerateMeta(admin)
}