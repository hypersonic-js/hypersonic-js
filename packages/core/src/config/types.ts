export type DatabaseProvider = 'postgresql' | 'sqlite'

export interface DatabaseConfig {
  provider: DatabaseProvider
}

export interface ServerConfig {
  port: number
  host: string
}

export interface AuthProviders {
  github?: boolean
  google?: boolean
}

export interface AuthRateLimit {
  /** Set to false to disable Better Auth's built-in rate limiting (useful in test environments). */
  enabled?: boolean
}

export interface AuthConfig {
  trustedOrigins: string[]
  providers?: AuthProviders
  /**
   * Better Auth rate-limit settings.
   * Pass `{ enabled: false }` in test environments to prevent the in-process
   * rate limiter from triggering 429 errors across shared test suites.
   */
  rateLimit?: AuthRateLimit
}

export interface InertiaConfig {
  ssr: boolean
  version?: string
}

/**
 * Pino log levels in order of increasing severity.
 * 'silent' disables all output.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

export interface LoggingConfig {
  /**
   * Minimum log level emitted by the framework's Pino logger.
   * Defaults to 'error' when the logging block is omitted.
   */
  level: LogLevel
}

export interface HypersonicConfig {
  server: ServerConfig
  auth: AuthConfig
  inertia: InertiaConfig
  database: DatabaseConfig
  /**
   * Server-side logging configuration.
   * Omit to use the framework default (level: 'error').
   */
  logging?: LoggingConfig
}