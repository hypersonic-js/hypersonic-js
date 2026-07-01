import type { DatabaseProvider } from '../config/types.js'

export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Better Auth `secondaryStorage` shape.
 * Wired automatically by `createApp` when `limits.backend` is `'redis'`
 * so Better Auth's auth-endpoint rate limiting uses the same Redis instance.
 */
export interface BetterAuthSecondaryStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Better Auth `rateLimit.customStorage` shape.
 * Wired automatically by `createApp` when `limits.backend` is `'database'`
 * so Better Auth's auth-endpoint rate limiting uses the Prisma `authRateLimit` model.
 */
export interface BetterAuthCustomStorage {
  get(key: string): Promise<{ count: number; lastRequest: number } | null>
  set(key: string, value: { count: number; lastRequest: number }): Promise<void>
}

/**
 * Better Auth rate-limit options forwarded to `betterAuth()`.
 * `enabled` is the public-facing option in `HypersonicConfig.auth.rateLimit`.
 * `storage` and `customStorage` are populated automatically by the limits
 * package integration in `createApp`.
 */
export interface AuthRateLimitOptions {
  enabled?: boolean
  storage?: 'secondary-storage'
  customStorage?: BetterAuthCustomStorage
}

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

// Re-exported so consumers can type the auth instance without importing better-auth directly
export type { betterAuth as BetterAuth } from 'better-auth'