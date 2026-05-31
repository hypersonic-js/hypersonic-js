import { Command } from 'commander'
import { registerAdminCommands } from './commands/admin/index.js'

/**
 * Current CLI version — keep in sync with package.json.
 * Updated automatically by changeset releases.
 */
export const CLI_VERSION = '0.1.2'

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

  return program
}
