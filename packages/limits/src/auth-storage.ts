import type { BetterAuthCustomStorage, BetterAuthSecondaryStorage } from '@hypersonic-js/core'
import type { LimitsConfig } from './types.js'
import type { PrismaAuthRateLimitModel } from './stores/prisma-store.js'
import { noopClose } from './utils.js'

// Re-exported so consumers who import from @hypersonic-js/limits directly
// continue to get the canonical types without a breaking change.
export type { BetterAuthCustomStorage, BetterAuthSecondaryStorage } from '@hypersonic-js/core'

/**
 * The configuration object that `buildAuthLimitsConfig` returns.
 * Callers spread this into the `createAuth` options so Better Auth
 * uses the same storage backend as `createLimiter`.
 */
export interface BetterAuthLimitsConfig {
  rateLimit?: {
    enabled?: boolean
    storage?: 'secondary-storage'
    customStorage?: BetterAuthCustomStorage
  }
  secondaryStorage?: BetterAuthSecondaryStorage
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
 * timestamps and the schema's BigInt column.
 */
export function buildDatabaseAuthStorage(
  authRateLimit: PrismaAuthRateLimitModel,
): BetterAuthLimitsConfig {
  const customStorage: BetterAuthCustomStorage = {
    async get(key) {
      const record = await authRateLimit.findUnique({ where: { key } })
      if (record === null) return null
      return { count: record.count, lastRequest: Number(record.lastRequest) }
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
 * Redis backend: use Better Auth's `secondaryStorage` backed by a
 * dedicated node-redis client. Better Auth stores rate limit data as
 * JSON strings through secondaryStorage.
 */
export async function buildRedisAuthStorage(
  redisUrl: string,
): Promise<BetterAuthLimitsConfig> {
  const { createClient } = await import('redis')
  const client = createClient({ url: redisUrl })

  client.on('error', (err: unknown) => {
    console.error('Hypersonic Auth Redis Client Error:', err)
  })

  await (client as unknown as { connect(): Promise<void> }).connect()

  const typedClient = client as unknown as {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<unknown>
    setEx(key: string, seconds: number, value: string): Promise<unknown>
    del(key: string): Promise<number>
    quit(): Promise<unknown>
  }

  const secondaryStorage: BetterAuthSecondaryStorage = {
    async get(key) {
      return typedClient.get(key)
    },
    async set(key, value, ttl) {
      if (ttl !== undefined) {
        await typedClient.setEx(key, ttl, value)
      } else {
        await typedClient.set(key, value)
      }
    },
    async delete(key) {
      await typedClient.del(key)
    },
  }

  return {
    rateLimit: { enabled: true, storage: 'secondary-storage' },
    secondaryStorage,
    close: () => typedClient.quit().then(() => undefined),
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
  return buildRedisAuthStorage(env.REDIS_URL)
}