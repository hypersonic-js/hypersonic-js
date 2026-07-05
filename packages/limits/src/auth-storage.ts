import type { AuthRateLimitOptions, BetterAuthCustomStorage } from '@hypersonic-js/core'
import type { LimitsConfig } from './types.js'
import type { PrismaAuthRateLimitModel } from './stores/prisma-store.js'
import { connectRedisClient } from './stores/redis-store.js'
import { noopClose } from './utils.js'

// Re-exported so consumers who import from @hypersonic-js/limits directly
// continue to get the canonical types without a breaking change.
export type { AuthRateLimitOptions, BetterAuthCustomStorage } from '@hypersonic-js/core'

/**
 * The configuration object that `buildAuthLimitsConfig` returns.
 * Callers spread this into the `createAuth` options so Better Auth
 * uses the same storage backend as `createLimiter`.
 *
 * `rateLimit` is typed as the full `AuthRateLimitOptions` (Better Auth's own
 * rate-limit option type) rather than a hand-duplicated subset — the
 * functions below only ever populate `enabled`/`customStorage`, but
 * re-declaring that subset here would be the exact same drift risk that
 * `AuthRateLimitOptions` itself was fixed for.
 *
 * There is deliberately no `secondaryStorage` field: Better Auth's
 * `secondaryStorage` is a shared store also used for session data and
 * verification records, not just rate limiting. Every backend below wires
 * rate limiting through `rateLimit.customStorage` instead, which is scoped
 * to rate-limit records only.
 */
export interface BetterAuthLimitsConfig {
  rateLimit?: AuthRateLimitOptions
  /**
   * Releases any resources opened for this backend — the Redis connection
   * for the `redis` backend, or a no-op for `memory` and `database`.
   * `createApp` wires this into its `stop()` lifecycle hook.
   */
  close: () => Promise<void>
}

// ── Per-backend builders ──────────────────────────────────────────────────────

/**
 * Memory backend: rely on Better Auth's default in-process rate limiter.
 */
export function buildMemoryAuthStorage(): BetterAuthLimitsConfig {
  return { rateLimit: { enabled: true }, close: noopClose }
}

/**
 * Database backend: use Better Auth's `customStorage` backed by the
 * Prisma `authRateLimit` model. Converts between Better Auth's numeric
 * timestamps and the schema's BigInt column. Returns `key` alongside
 * `count`/`lastRequest` — Better Auth's real `BetterAuthRateLimitStorage.get()`
 * contract requires the full `RateLimit` record shape, not just the two
 * counter fields.
 */
export function buildDatabaseAuthStorage(
  authRateLimit: PrismaAuthRateLimitModel,
): BetterAuthLimitsConfig {
  const customStorage: BetterAuthCustomStorage = {
    async get(key) {
      const record = await authRateLimit.findUnique({ where: { key } })
      if (record === null) return null
      return { key: record.key, count: record.count, lastRequest: Number(record.lastRequest) }
    },
    async set(key, value) {
      await authRateLimit.upsert({
        where: { key },
        create: { key, count: value.count, lastRequest: BigInt(value.lastRequest) },
        update: { count: value.count, lastRequest: BigInt(value.lastRequest) },
      })
    },
  }

  return { rateLimit: { enabled: true, customStorage }, close: noopClose }
}

/**
 * Redis backend: use Better Auth's `rateLimit.customStorage` backed by a
 * dedicated node-redis client — not `secondaryStorage`. `secondaryStorage`
 * is a shared store Better Auth also uses for session data and verification
 * records (email verification, magic links, etc); wiring the rate-limit
 * Redis connection through it would silently move session and verification
 * persistence off the primary database and into Redis too, just because
 * `limits.backend` was set to `'redis'`. `customStorage` is scoped to
 * rate-limit records only, matching what `buildDatabaseAuthStorage` above
 * already does for the `database` backend.
 *
 * Records are JSON-encoded (`{ key, count, lastRequest }`) and written with
 * `setEx(key, window, ...)`, so expired rate-limit windows are cleaned up by
 * Redis automatically instead of accumulating indefinitely — `window` comes
 * from the `redis` variant of `LimitsConfig`, which requires it explicitly
 * for exactly this reason.
 */
export async function buildRedisAuthStorage(
  redisUrl: string,
  window: number,
): Promise<BetterAuthLimitsConfig> {
  const client = await connectRedisClient(redisUrl, 'Auth')

  const customStorage: BetterAuthCustomStorage = {
    async get(key) {
      const value = await client.get(key)
      if (value === null) return null
      return JSON.parse(value) as { key: string; count: number; lastRequest: number }
    },
    async set(key, value) {
      await client.setEx(key, window, JSON.stringify(value))
    },
  }

  return {
    rateLimit: { enabled: true, customStorage },
    close: () => client.quit().then(() => undefined),
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Builds the Better Auth rate limit configuration that matches the configured
 * limits backend. This is called by `@hypersonic-js/core` via dynamic import
 * inside `createApp` so that Better Auth's auth-endpoint rate limiting
 * automatically uses the same storage backend as route-level limiting.
 *
 * @param config  - The `limits` block from `hypersonic.config.ts`.
 * @param env     - Validated environment variables (for REDIS_URL).
 * @param prisma  - The user's Prisma client — required for the database backend.
 */
export async function buildAuthLimitsConfig(
  config: LimitsConfig,
  env: { REDIS_URL?: string },
  prisma?: { authRateLimit: PrismaAuthRateLimitModel },
): Promise<BetterAuthLimitsConfig> {
  if (config.backend === 'memory') {
    return buildMemoryAuthStorage()
  }

  if (config.backend === 'database') {
    if (prisma === undefined) {
      throw new Error(
        'Hypersonic: prisma must be provided to createApp when limits.backend is "database".',
      )
    }
    return buildDatabaseAuthStorage(prisma.authRateLimit)
  }

  // redis
  if (env.REDIS_URL === undefined || env.REDIS_URL === '') {
    throw new Error(
      'Hypersonic: REDIS_URL must be set in your .env when limits.backend is "redis".',
    )
  }
  return buildRedisAuthStorage(env.REDIS_URL, config.window)
}