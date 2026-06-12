import pino, { type Logger } from 'pino'
import type { LogLevel } from '../config/types.js'

export type { Logger }

/**
 * Creates a configured Pino logger for the Hypersonic server.
 * Defaults to 'error' level so production deployments are quiet by default —
 * only genuine errors reach the log stream unless the developer explicitly
 * lowers the level in hypersonic.config.ts.
 */
export function createLogger(level: LogLevel = 'error'): Logger {
  return pino({ level })
}