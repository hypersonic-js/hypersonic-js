import { RedisStore } from 'rate-limit-redis'
import type { RedisReply } from 'rate-limit-redis'
import type { Store } from 'express-rate-limit'
import type { BlockStore } from '../block-store.js'

/**
 * Minimal structural interface for the node-redis v5 client.
 * Defined here so we can mock it in tests without importing `redis` directly.
 */
export interface RedisClientLike {
  sendCommand(args: string[]): Promise<RedisReply>
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { PX?: number }): Promise<string | null>
  setEx(key: string, seconds: number, value: string): Promise<string>
  exists(key: string): Promise<number>
  del(key: string | string[]): Promise<number>
  connect(): Promise<unknown>
  /** Gracefully closes the connection — used by createLimiter()'s close(). */
  quit(): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

export interface RedisStoreResult {
  store: Store
  redisClient: RedisClientLike
}

/**
 * Dynamically imports node-redis, connects a client from the given URL, and
 * registers an error handler labeled for the calling subsystem so a
 * connection error in the logs is traceable to its origin (e.g. "Limits" for
 * route-level rate limiting, "Auth" for Better Auth's auth-endpoint rate
 * limiting).
 *
 * Shared by `createRedisStore` (route-level limiting, below) and
 * `buildRedisAuthStorage` (`../auth-storage.ts`, Better Auth's auth-endpoint
 * rate limiting) — each opens its own independent Redis connection through
 * this one helper rather than duplicating the connect/error-handler/connect()
 * sequence in two places.
 */
export async function connectRedisClient(redisUrl: string, label: string): Promise<RedisClientLike> {
  const { createClient } = await import('redis')
  const client = createClient({ url: redisUrl }) as unknown as RedisClientLike

  client.on('error', (err: unknown) => {
    console.error(`Hypersonic ${label} Redis Client Error:`, err)
  })

  await client.connect()

  return client
}

/**
 * Wraps an already-connected Redis client in an express-rate-limit Store,
 * namespaced with `prefix`. This is the only place a `RedisStore` gets
 * constructed — both `createRedisStore` (below) and `createLimiter()`'s
 * redis backend (`../middleware.js`) go through this helper rather than
 * duplicating the construction call.
 *
 * `createLimiter()` uses this directly (rather than `createRedisStore`) so
 * that every route registered on the same limiter can share one Redis
 * connection while still getting its own key namespace via a distinct
 * `prefix` per route — `createRedisStore` opens a brand-new connection per
 * call, which isn't what's wanted when multiple routes share a limiter.
 */
export function wrapRedisStore(client: RedisClientLike, prefix: string): Store {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => client.sendCommand(args),
  })
}

/**
 * Connects a Redis client (via `connectRedisClient`) and returns both the
 * express-rate-limit RedisStore and the raw client (used by RedisBlockStore
 * to track block-duration state separately, and by createLimiter() to close
 * the connection).
 *
 * `prefix` namespaces the store's keys — see `wrapRedisStore`'s doc comment.
 */
export async function createRedisStore(redisUrl: string, prefix: string): Promise<RedisStoreResult> {
  const client = await connectRedisClient(redisUrl, 'Limits')
  const store = wrapRedisStore(client, prefix)

  return { store, redisClient: client }
}

const BLOCK_KEY_PREFIX = 'rl:block:'

/**
 * Redis-backed BlockStore. Uses a dedicated key per client
 * (prefixed with `rl:block:`) with a TTL matching blockDuration.
 * Presence of the key means the client is blocked.
 */
export class RedisBlockStore implements BlockStore {
  constructor(private readonly client: RedisClientLike) {}

  async isBlocked(key: string): Promise<boolean> {
    const count = await this.client.exists(`${BLOCK_KEY_PREFIX}${key}`)
    return count > 0
  }

  async block(key: string, durationMs: number): Promise<void> {
    await this.client.set(`${BLOCK_KEY_PREFIX}${key}`, '1', { PX: durationMs })
  }
}