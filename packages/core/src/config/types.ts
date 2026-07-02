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

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Storage backend for `@hypersonic-js/limits`. */
export type LimitsBackend = 'memory' | 'database' | 'redis'

/**
 * Configuration for the `@hypersonic-js/limits` package.
 * When present, pass `buildAuthLimitsConfig` (from `@hypersonic-js/limits`)
 * as `createApp`'s `limitsPlugin` option to wire the same backend into
 * Better Auth's auth-endpoint rate limiting — `createApp` does not resolve
 * `@hypersonic-js/limits` itself. See `CreateAppOptions.limitsPlugin`.
 *
 * A discriminated union on `backend` — only the `redis` variant carries a
 * `window`. Better Auth's auth-endpoint rate limiter needs an explicit
 * window (seconds) to use as the TTL on each Redis-backed rate-limit
 * record (see `buildRedisAuthStorage` in `@hypersonic-js/limits`); without
 * one, expired rate-limit keys would never be cleaned up and would
 * accumulate in Redis indefinitely. `memory` and `database` don't need
 * this — the in-process map is garbage collected with the process, and the
 * database backend's upsert-per-key row doesn't need a TTL to stay bounded.
 *
 * This is intentionally a different (narrower) type than what
 * `createLimiter` (route-level rate limiting, in `@hypersonic-js/limits`)
 * accepts for its own `config` option — that one only ever reads `backend`
 * and has no relationship to Better Auth's auth-endpoint window, so it
 * isn't forced to supply a `window` it would never use.
 */
export type LimitsConfig =
  | {
      /** In-process Map, zero config, single-server only. */
      backend: 'memory'
    }
  | {
      /** Prisma-backed, requires `RateLimit` + `AuthRateLimit` models in your schema. */
      backend: 'database'
    }
  | {
      /** Redis-backed, requires `REDIS_URL` in `.env`. */
      backend: 'redis'
      /**
       * Time window, in seconds, for Better Auth's auth-endpoint rate
       * limiting. Used as the TTL (`setEx`) on each Redis-backed rate-limit
       * record so expired windows are cleaned up automatically instead of
       * accumulating indefinitely.
       */
      window: number
    }

// ── Root config ───────────────────────────────────────────────────────────────

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
  /**
   * Rate limiting configuration — requires `@hypersonic-js/limits` to be
   * installed, and its `buildAuthLimitsConfig` passed as `createApp`'s
   * `limitsPlugin` option (see `CreateAppOptions.limitsPlugin`).
   */
  limits?: LimitsConfig
}