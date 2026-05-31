import type { Command } from 'commander'
import { registerAdminScaffold } from './scaffold.js'

/**
 * Registers the `hypersonic admin` command group and all its subcommands.
 * Add future admin subcommands here (e.g. seed, export).
 */
export function registerAdminCommands(program: Command): void {
  const admin = program
    .command('admin')
    .description('Admin dashboard commands')

  registerAdminScaffold(admin)
}
