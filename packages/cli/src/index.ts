import { Command } from 'commander'
import { registerAdminCommands } from './commands/admin/index.js'
import { registerNewCommand } from './commands/new/index.js'
import pkg from '../package.json' with { type: 'json' }

export const CLI_VERSION: string = pkg.version

/**
 * Builds and returns the configured Commander program.
 * Exported separately from parse() so the program is testable
 * without actually invoking process.argv.
 */
export function createProgram(): Command {
  const program = new Command()
    .name('hypersonic')
    .description('Hypersonic.js framework CLI')
    .version(CLI_VERSION, '-v, --version', 'Print the CLI version')

  registerAdminCommands(program)
  registerNewCommand(program)

  return program
}