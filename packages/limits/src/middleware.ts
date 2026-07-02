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
import { noopClose } from './utils.js'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Call once per route with per-route options to get an Express RequestHandler. */
export type LimitFactory = (options: LimitOptions) => RequestHandler

/**
 * Return value of `createLimiter()`.
 *
 * `limit` builds route middleware, same as before. `close` releases any
 * resources opened for the configured backend — the Redis connection for
 * the `redis` backend, or a no-op for `memory` and `database`. Callers that
 * build a limiter with a bounded lifetime (e.g. per-test-app in an
 * integration suite) should call `close()` during teardown.
 */
export interface Limiter {
  limit: LimitFactory
  close: () => Promise<void>
}

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

    // Fail open on a block-store lookup error rather than rejecting the
    // request outright — a transient backend outage (Redis down, DB
    // unreachable) should degrade to "skip the block shortcut", not turn
    // every guarded route into a 500. The hit-count-based limit below
    // still applies normally either way.
    let blocked = false
    try {
      blocked = await blockStore.isBlocked(key)
    } catch {
      // Best-effort — see comment above.
    }

    if (blocked) {
      res.status(429).json({ message })
      return
    }
    limiter(req, res, next)
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Creates a rate limiter for the configured backend.
 *
 * `limit()` is called once per route with per-route options and returns a
 * standard Express `RequestHandler`. `close()` releases any resources the
 * backend opened (e.g. the Redis connection) — call it during teardown for
 * limiters with a bounded lifetime:
 *
 * ```ts
 * const limiter = await createLimiter({ config: config.limits, env, prisma })
 *
 * app.express.post(
 *   '/api/auth/login',
 *   limiter.limit({ requests: 5, windowMs: 60_000, blockDuration: 300_000 }),
 *   loginHandler,
 * )
 *
 * // during shutdown:
 * await limiter.close()
 * ```
 *
 * For the `database` backend the Prisma store is constructed per `limit()`
 * call so each route gets an independent counter store (windowMs is baked
 * into the store at construction time). The BlockStore is shared across
 * calls since blocking is keyed by client IP, not by route.
 */
export async function createLimiter(options: CreateLimiterOptions): Promise<Limiter> {
  const { config, env, prisma } = options

  if (config.backend === 'memory') {
    const store = createMemoryStore()
    const blockStore = new MemoryBlockStore()
    return {
      limit: (limitOptions: LimitOptions): RequestHandler =>
        buildCompoundMiddleware(store, blockStore, limitOptions),
      close: noopClose,
    }
  }

  if (config.backend === 'redis') {
    if (!env.REDIS_URL) {
      throw new Error(
        'Hypersonic: REDIS_URL must be set in your .env when limits.backend is "redis".',
      )
    }
    const { store, redisClient } = await createRedisStore(env.REDIS_URL)
    const blockStore = new RedisBlockStore(redisClient)
    return {
      limit: (limitOptions: LimitOptions): RequestHandler =>
        buildCompoundMiddleware(store, blockStore, limitOptions),
      close: () => redisClient.quit().then(() => undefined),
    }
  }

  if (config.backend === 'database') {
    if (prisma === undefined) {
      throw new Error(
        'Hypersonic: prisma must be provided to createLimiter when limits.backend is "database".',
      )
    }
    const blockStore = new PrismaBlockStore(prisma.rateLimit)
    return {
      limit: (limitOptions: LimitOptions): RequestHandler => {
        // PrismaStore is constructed per-call so each route has its own
        // window counter while the block store is shared (keyed by client IP).
        const store = new PrismaStore(prisma.rateLimit, limitOptions.windowMs)
        return buildCompoundMiddleware(store, blockStore, limitOptions)
      },
      close: noopClose,
    }
  }

  throw new Error(
    `Hypersonic: unknown limits backend "${config.backend as string}". ` +
      'Supported backends: memory, database, redis.',
  )
}