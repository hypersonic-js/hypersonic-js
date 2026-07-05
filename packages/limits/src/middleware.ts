import { rateLimit } from 'express-rate-limit'
import type { Store } from 'express-rate-limit'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { MemoryBlockStore } from './block-store.js'
import type { BlockStore } from './block-store.js'
import { createMemoryStore } from './stores/memory-store.js'
import { connectRedisClient, wrapRedisStore, RedisBlockStore } from './stores/redis-store.js'
import { PrismaStore, PrismaBlockStore } from './stores/prisma-store.js'
import type { PrismaRateLimitModel } from './stores/prisma-store.js'
import type { LimitsBackend, LimitOptions } from './types.js'
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
  /**
   * Only `backend` is read here — intentionally narrower than the full
   * `LimitsConfig` used for `HypersonicConfig.limits`. That type requires a
   * `window` for its `redis` variant, but `window` exists solely for Better
   * Auth's auth-endpoint rate limiting (see `buildRedisAuthStorage` in
   * `./auth-storage.ts`); this route-level limiter has no use for it, so
   * it isn't forced to accept a field it would never read.
   */
  config: { backend: LimitsBackend }
  env: { REDIS_URL?: string }
  /** Required when config.backend is 'database'. */
  prisma?: { rateLimit: PrismaRateLimitModel }
}

// ── Name uniqueness ───────────────────────────────────────────────────────────

/**
 * Throws if `name` has already been used by an earlier `.limit()` call on
 * this same `Limiter`. Each route's counter is namespaced by its `name`
 * (see `PrismaStore`/`wrapRedisStore`'s use of it) — a duplicate name would
 * silently make two routes share a counter and window configuration again,
 * exactly what the namespacing exists to prevent, so this fails fast at
 * setup time instead of allowing a silent collision at request time.
 */
function assertUniqueLimiterName(usedNames: Set<string>, name: string): void {
  if (usedNames.has(name)) {
    throw new Error(
      `Hypersonic: limit() was called with a duplicate name "${name}". ` +
        'Each route registered on the same limiter must use a unique name.',
    )
  }
  usedNames.add(name)
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
 * const limiter = await createLimiter({ config: { backend: config.limits.backend }, env, prisma })
 *
 * app.express.post(
 *   '/api/auth/login',
 *   limiter.limit({ name: 'login', requests: 5, windowMs: 60_000, blockDuration: 300_000 }),
 *   loginHandler,
 * )
 *
 * // during shutdown:
 * await limiter.close()
 * ```
 *
 * Every route's counter is namespaced by its `name` — required on every
 * `.limit()` call and unique across every call made on the same `Limiter`
 * (a duplicate throws). This applies uniformly across all three backends:
 * the `memory` and `redis` backends construct a fresh, independent counter
 * store per `.limit()` call (a new `MemoryStore` for memory; a new,
 * distinctly-prefixed `RedisStore` sharing one Redis connection for redis),
 * and the `database` backend threads `name` into `PrismaStore` to prefix
 * every key it sends to Prisma. Without this, two routes sharing a
 * `Limiter` would silently share a counter and window configuration for
 * the same client. The BlockStore, in contrast, is shared across calls on
 * purpose — blocking is keyed by client IP, not by route.
 */
export async function createLimiter(options: CreateLimiterOptions): Promise<Limiter> {
  const { config, env, prisma } = options
  const usedNames = new Set<string>()

  if (config.backend === 'memory') {
    const blockStore = new MemoryBlockStore()
    return {
      limit: (limitOptions: LimitOptions): RequestHandler => {
        assertUniqueLimiterName(usedNames, limitOptions.name)
        // A fresh MemoryStore per route — per its own doc comment, separate
        // instances never share state, so this alone isolates routes from
        // each other (no prefix needed, unlike the redis/database backends).
        const store = createMemoryStore()
        return buildCompoundMiddleware(store, blockStore, limitOptions)
      },
      close: noopClose,
    }
  }

  if (config.backend === 'redis') {
    if (!env.REDIS_URL) {
      throw new Error(
        'Hypersonic: REDIS_URL must be set in your .env when limits.backend is "redis".',
      )
    }
    // One shared connection for every route on this limiter — opening a
    // fresh connection per .limit() call would be wasteful. Each route
    // still gets its own key namespace via a distinct prefix below.
    const redisClient = await connectRedisClient(env.REDIS_URL, 'Limits')
    const blockStore = new RedisBlockStore(redisClient)
    return {
      limit: (limitOptions: LimitOptions): RequestHandler => {
        assertUniqueLimiterName(usedNames, limitOptions.name)
        const store = wrapRedisStore(redisClient, `rl:${limitOptions.name}:`)
        return buildCompoundMiddleware(store, blockStore, limitOptions)
      },
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
        assertUniqueLimiterName(usedNames, limitOptions.name)
        // PrismaStore is constructed per-call so each route has its own
        // window counter, and its keys are namespaced by `name` so routes
        // sharing this Prisma client never share a row for the same client.
        const store = new PrismaStore(prisma.rateLimit, limitOptions.windowMs, limitOptions.name)
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