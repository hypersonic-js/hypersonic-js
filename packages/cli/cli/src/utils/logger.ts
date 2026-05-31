import pc from 'picocolors'

/**
 * Minimal coloured console logger for CLI output.
 * Writes info/success/warn to stdout, error to stderr.
 */
export const logger = {
  info: (msg: string): void => {
    process.stdout.write(pc.blue('  info ') + msg + '\n')
  },
  success: (msg: string): void => {
    process.stdout.write(pc.green('  ✓ ') + msg + '\n')
  },
  warn: (msg: string): void => {
    process.stdout.write(pc.yellow('  warn ') + msg + '\n')
  },
  error: (msg: string): void => {
    process.stderr.write(pc.red('  ✗ ') + msg + '\n')
  },
}
