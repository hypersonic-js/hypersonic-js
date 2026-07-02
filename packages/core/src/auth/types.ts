import type { BetterAuthOptions, BetterAuthRateLimitOptions, BetterAuthRateLimitStorage } from 'better-auth'
import type { DatabaseProvider } from '../config/types.js'

export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Better Auth's `secondaryStorage` option type.
 * Sourced directly from Better Auth's own `BetterAuthOptions` — Better Auth
 * does not export its internal `SecondaryStorage` interface by name, so this
 * is reached via indexed access rather than a hand-copied field list. Doing
 * it this way means this type can never drift from what `betterAuth()`
 * actually accepts (confirmed against the real `.d.mts` output of
 * better-auth@1.6.19 — it also includes optional `getAndDelete` and
 * `increment` methods beyond `get`/`set`/`delete`).
 * Re-exported under our own name so consumers of `@hypersonic-js/core` can
 * type their `secondaryStorage` implementation without importing
 * `better-auth` themselves.
 * Wired automatically by `createApp` when `limits.backend` is `'redis'`
 * so Better Auth's auth-endpoint rate limiting uses the same Redis instance.
 */
export type BetterAuthSecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>

/**
 * Better Auth's `rateLimit.customStorage` option type.
 * Better Auth exports this by name as `BetterAuthRateLimitStorage`; aliased
 * here under our own name for the same reason as `BetterAuthSecondaryStorage`
 * above.
 * Wired automatically by `createApp` when `limits.backend` is `'database'`
 * so Better Auth's auth-endpoint rate limiting uses the Prisma `authRateLimit` model.
 */
export type BetterAuthCustomStorage = BetterAuthRateLimitStorage

/**
 * Better Auth's `rateLimit` option type, aliased directly from Better Auth's
 * own exported `BetterAuthRateLimitOptions` rather than hand-copied. This
 * fixes a real bug: the previous hand-rolled subset only had
 * `enabled`/`storage`/`customStorage` and rejected valid literal configs
 * using `window`, `max`, `customRules`, or `modelName`, or `storage: "memory"`
 * / `"database"` — all of which Better Auth genuinely supports and which
 * `createAuth` already passed through at runtime.
 * `enabled` is the public-facing option in `HypersonicConfig.auth.rateLimit`.
 * `storage` and `customStorage` are populated automatically by the limits
 * package integration in `createApp`.
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
   * `storage` and `customStorage` are populated automatically by `createApp`
   * when `config.limits` is set.
   */
  rateLimit?: AuthRateLimitOptions
  /**
   * Better Auth secondary storage — wired automatically when `limits.backend`
   * is `'redis'`. Passed through to `betterAuth({ secondaryStorage })`.
   */
  secondaryStorage?: BetterAuthSecondaryStorage
}

// Re-exported so consumers can type the auth instance without importing better-auth directly.
export type { betterAuth as BetterAuth } from 'better-auth'