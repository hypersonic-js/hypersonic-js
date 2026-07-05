import type { BetterAuthRateLimitOptions, BetterAuthRateLimitStorage } from 'better-auth'
import type { DatabaseProvider } from '../config/types.js'

export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Better Auth's `rateLimit.customStorage` option type.
 * Better Auth exports this by name as `BetterAuthRateLimitStorage`; aliased
 * here under our own name so consumers of `@hypersonic-js/core` can type
 * their own implementation without importing `better-auth` themselves.
 * Wired automatically by `createApp` when `limits.backend` is `'database'`
 * (backed by the Prisma `authRateLimit` model) or `'redis'` (backed by a
 * dedicated Redis connection) — see `@hypersonic-js/limits`'s
 * `buildDatabaseAuthStorage` / `buildRedisAuthStorage`.
 *
 * Note this is deliberately *not* `secondaryStorage`: Better Auth's
 * `secondaryStorage` is a shared store also used for session data and
 * verification records, so wiring the rate-limit backend through it would
 * silently move session/verification persistence off the primary database
 * too. `customStorage` is scoped to rate-limit records only.
 */
export type BetterAuthCustomStorage = BetterAuthRateLimitStorage

/**
 * Better Auth's `rateLimit` option type, aliased directly from Better Auth's
 * own exported `BetterAuthRateLimitOptions` rather than hand-copied. This
 * fixes a real bug: a previous hand-rolled subset only had
 * `enabled`/`storage`/`customStorage` and rejected valid literal configs
 * using `window`, `max`, `customRules`, or `modelName`, or `storage: "memory"`
 * / `"database"` — all of which Better Auth genuinely supports and which
 * `createAuth` already passed through at runtime.
 * `enabled` is the public-facing option in `HypersonicConfig.auth.rateLimit`.
 * `customStorage` is populated automatically by the limits package
 * integration in `createApp` for the `database` and `redis` backends.
 */
export type AuthRateLimitOptions = BetterAuthRateLimitOptions

export interface AuthSetupOptions {
  secret: string
  trustedOrigins: string[]
  /** Database provider — used to configure the Better Auth Prisma adapter. */
  provider: DatabaseProvider
  prisma: unknown
  providers?: {
    github?: SocialProviderCredentials
    google?: SocialProviderCredentials
  }
  /**
   * Better Auth rate-limit settings.
   * Pass `{ enabled: false }` in test environments to suppress the in-process
   * rate limiter and avoid 429s across shared test suites.
   * `customStorage` is populated automatically by `createApp` when
   * `config.limits` is set to the `database` or `redis` backend.
   */
  rateLimit?: AuthRateLimitOptions
}

// Re-exported so consumers can type the auth instance without importing better-auth directly.
export type { betterAuth as BetterAuth } from 'better-auth'