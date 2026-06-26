import { rateLimit } from 'express-rate-limit'
import type { Store } from 'express-rate-limit'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { MemoryBlockStore } from './block-store.js'
import type { BlockStore } from './block-store.js'
import { createMemoryStore } from './stores/memory-store.js'
import { createRedisStore, RedisBlockStore } from './stores/redis-store.js'
import { PrismaStore, PrismaBlockStore } from './stores/prisma-store.js'
import type { PrismaRateLimitModel } from './stores/prisma-store.js'
import type { LimitsConfig, LimitOptions } from './types.js'

// ── Types ─────────────────────────────────────────────────────────────────────

/** The function returned by createLimiter — call it to get a route middleware. */
export type LimitFactory = (options: LimitOptions) => RequestHandler

export interface CreateLimiterOptions {
  config: LimitsConfig
  env: { REDIS_URL?: string }
  /** Required when config.backend is 'database'. */
  prisma?: { rateLimit: PrismaRateLimitModel }
}

// ── Compound middleware builder ────────────────────────────────────────────────

/**
 * Composes the express-rate-limit middleware with an optional block-duration
 * pre-check. When blockDuration is set, requests from a blocked client are
 * rejected before ever reaching the hit counter.
 *
 * The handler fires when the rate limit is first exceeded — it writes to the
 * BlockStore so subsequent requests within blockDuration are rejected
 * immediately by the pre-check.
 */
function buildCompoundMiddleware(
  store: Store | undefined,
  blockStore: BlockStore,
  options: LimitOptions,
): RequestHandler {
  const {
    requests,
    windowMs,
    blockDuration,
    message = 'Too many requests, please try again later.',
  } = options

  const limiter = rateLimit({
    windowMs,
    limit: requests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message },
    store,
    handler: (req: Request, res: Response) => {
      void (async () => {
        if (blockDuration !== undefined) {
          const key = req.ip ?? 'unknown'
          try {
            await blockStore.block(key, blockDuration)
          } catch {
            // Best-effort — still return 429 even if block write fails
          }
        }
        res.status(429).json({ message })
      })()
    },
  })

  // No blockDuration — return the vanilla rate limiter
  if (blockDuration === undefined) {
    return limiter
  }

  // With blockDuration — wrap with a pre-check that rejects already-blocked clients
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.ip ?? 'unknown'
    const blocked = await blockStore.isBlocked(key)
    if (blocked) {
      res.status(429).json({ message })
      return
    }
    limiter(req, res, next)
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Creates a rate limiter factory for the configured backend.
 *
 * The returned `limit()` function is called once per route with per-route
 * options and returns a standard Express `RequestHandler`:
 *
 * ```ts
 * const limit = await createLimiter({ config: config.limits, env, prisma })
 *
 * app.express.post(
 *   '/api/auth/login',
 *   limit({ requests: 5, windowMs: 60_000, blockDuration: 300_000 }),
 *   loginHandler,
 * )
 * ```
 *
 * For the `database` backend the Prisma store is constructed per `limit()`
 * call so each route gets an independent counter store (windowMs is baked
 * into the store at construction time). The BlockStore is shared across
 * calls since blocking is keyed by client IP, not by route.
 */
export async function createLimiter(options: CreateLimiterOptions): Promise<LimitFactory> {
  const { config, env, prisma } = options

  if (config.backend === 'memory') {
    const store = createMemoryStore()
    const blockStore = new MemoryBlockStore()
    return (limitOptions: LimitOptions): RequestHandler =>
      buildCompoundMiddleware(store, blockStore, limitOptions)
  }

  if (config.backend === 'redis') {
    if (!env.REDIS_URL) {
      throw new Error(
        'Hypersonic: REDIS_URL must be set in your .env when limits.backend is "redis".',
      )
    }
    const { store, redisClient } = await createRedisStore(env.REDIS_URL)
    const blockStore = new RedisBlockStore(redisClient)
    return (limitOptions: LimitOptions): RequestHandler =>
      buildCompoundMiddleware(store, blockStore, limitOptions)
  }

  if (config.backend === 'database') {
    if (prisma === undefined) {
      throw new Error(
        'Hypersonic: prisma must be provided to createLimiter when limits.backend is "database".',
      )
    }
    const blockStore = new PrismaBlockStore(prisma.rateLimit)
    return (limitOptions: LimitOptions): RequestHandler => {
      // PrismaStore is constructed per-call so each route has its own
      // window counter while the block store is shared (keyed by client IP).
      const store = new PrismaStore(prisma.rateLimit, limitOptions.windowMs)
      return buildCompoundMiddleware(store, blockStore, limitOptions)
    }
  }

  throw new Error(
    `Hypersonic: unknown limits backend "${config.backend as string}". ` +
      'Supported backends: memory, database, redis.',
  )
}
