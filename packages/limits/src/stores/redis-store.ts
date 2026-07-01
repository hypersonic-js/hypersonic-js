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
 * Dynamically imports node-redis, connects a client from the given URL,
 * and returns both the express-rate-limit RedisStore and the raw client
 * (used by RedisBlockStore to track block-duration state separately, and
 * by createLimiter() to close the connection).
 */
export async function createRedisStore(redisUrl: string): Promise<RedisStoreResult> {
  const { createClient } = await import('redis')
  const client = createClient({ url: redisUrl }) as unknown as RedisClientLike

  client.on('error', (err: unknown) => {
    console.error('Hypersonic Limits Redis Client Error:', err)
  })

  await client.connect()

  const store = new RedisStore({
    sendCommand: (...args: string[]) => client.sendCommand(args),
  })

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