import type { Store, ClientRateLimitInfo } from 'express-rate-limit'
import type { BlockStore } from '../block-store.js'

// ── Prisma model shapes ───────────────────────────────────────────────────────

interface RateLimitRecord {
  key: string
  points: number
  expireAt: Date | null
  blockUntil: Date | null
}

interface AuthRateLimitRecord {
  key: string
  count: number
  lastRequest: bigint
}

// ── Typed Prisma model interfaces ─────────────────────────────────────────────

/**
 * Minimal structural interface for the Prisma `rateLimit` model operations
 * used by PrismaStore and PrismaBlockStore. Avoids importing the generated
 * PrismaClient and keeps the package agnostic of the user's schema version.
 */
export interface PrismaRateLimitModel {
  findUnique(args: { where: { key: string } }): Promise<RateLimitRecord | null>
  /**
   * Used by `PrismaStore.increment()` to create the very first row for a
   * key that has never been seen before. A concurrent first-ever request
   * for the same key can race here — the loser gets a unique-constraint
   * violation on Prisma's standard `P2002` error code, which `increment()`
   * catches and retries (see its doc comment for the full algorithm).
   */
  create(args: {
    data: { key: string; points: number; expireAt: Date | null; blockUntil: Date | null }
  }): Promise<RateLimitRecord>
  /**
   * Used by `PrismaStore.increment()` to atomically claim either an
   * already-active window (incrementing its hit count) or an
   * absent-or-expired one (resetting it) — without a separate
   * read-then-write race. These are the only two `where` shapes
   * `increment()` sends; any real Prisma `updateMany` accepts a superset
   * of this, so the type below is a subset of (not an exact match for)
   * the generated method's real signature — the same "narrow structural
   * interface" approach used throughout this file.
   */
  updateMany(args: {
    where:
      | { key: string; expireAt: { gte: Date } }
      | { key: string; OR: [{ expireAt: null }, { expireAt: { lt: Date } }] }
    data: { points: number | { increment: number }; expireAt?: Date; blockUntil?: null }
  }): Promise<{ count: number }>
  upsert(args: {
    where: { key: string }
    create: { key: string; points: number; expireAt: Date | null; blockUntil: Date | null }
    update: {
      points: number | { increment: number }
      expireAt: Date | null
      blockUntil?: Date | null
    }
  }): Promise<RateLimitRecord>
  update(args: {
    where: { key: string }
    data: { points?: { decrement: number }; blockUntil?: Date | null }
  }): Promise<RateLimitRecord>
  delete(args: { where: { key: string } }): Promise<RateLimitRecord>
  deleteMany(): Promise<{ count: number }>
}

/**
 * Minimal structural interface for the Prisma `authRateLimit` model used
 * by the Better Auth custom storage adapter.
 */
export interface PrismaAuthRateLimitModel {
  findUnique(args: { where: { key: string } }): Promise<AuthRateLimitRecord | null>
  upsert(args: {
    where: { key: string }
    create: { key: string; count: number; lastRequest: bigint }
    update: { count: number; lastRequest: bigint }
  }): Promise<AuthRateLimitRecord>
  delete(args: { where: { key: string } }): Promise<AuthRateLimitRecord>
}

/**
 * Combined Prisma client shape required by `createLimiter` when using
 * the database backend. The user passes their generated PrismaClient
 * directly — structural typing means it satisfies this interface as long
 * as both models are present in the schema.
 */
export interface PrismaLimitsClient {
  rateLimit: PrismaRateLimitModel
  authRateLimit: PrismaAuthRateLimitModel
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Duck-types Prisma's known-request-error shape (`{ code: 'P2002' }` for a
 * unique-constraint violation) without importing `@prisma/client` — this
 * package stays agnostic of the generated client's runtime, matching the
 * structural-typing approach used for the model interfaces above. Prisma
 * normalizes unique-constraint violations to this same code across every
 * database it supports (Postgres, SQLite, MySQL).
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  )
}

/** Bounds increment()'s retry loop — see its doc comment for why 3 is always enough in practice. */
const MAX_INCREMENT_ATTEMPTS = 3

// ── PrismaStore ───────────────────────────────────────────────────────────────

/**
 * express-rate-limit Store backed by the Prisma `rateLimit` model.
 *
 * Window semantics: each `increment` call starts a new window when the
 * record is absent or expired, and extends within the existing window
 * otherwise — a fixed-window strategy. Window rollover is race-free under
 * concurrency: see `increment()`'s doc comment for how the database (not
 * application code) arbitrates concurrent writers to the same key, using
 * conditional atomic writes instead of a read-then-write. This relies only
 * on a unique constraint on `key` and standard read-committed-or-stronger
 * isolation — both available on every Prisma-supported database, no
 * transactions or raw SQL required.
 *
 * For very high-throughput or multi-region deployments, the Redis backend
 * remains the better choice — it avoids the database round-trips this
 * backend makes on every request.
 *
 * Every key this store sends to Prisma is prefixed with `name` (see
 * `namespacedKey()`) so that two `PrismaStore` instances for different
 * routes — even ones sharing the same underlying Prisma client — never
 * read or write the same row for the same client.
 */
export class PrismaStore implements Store {
  constructor(
    private readonly prisma: PrismaRateLimitModel,
    private readonly windowMs: number,
    private readonly name: string,
  ) {}

  /**
   * Prefixes a client key with this store's route name, so that two
   * `PrismaStore` instances for different routes (e.g. `login` and
   * `signup`) never read or write the same `rateLimit` row for the same
   * client — without this, both routes' counters and window
   * configurations would collide on the raw client key alone.
   */
  private namespacedKey(key: string): string {
    return `${this.name}:${key}`
  }

  /**
   * Atomically increments the hit count for `key`, starting a fresh window
   * when the existing one is absent or expired.
   *
   * This used to be a plain read-then-write (`findUnique`, then `upsert`
   * based on what it saw) — which raced under concurrency: two requests
   * arriving right at a window rollover could both observe "expired" and
   * both reset to `points: 1`, silently dropping whichever hit lost the
   * race. The algorithm below removes that window by pushing the expiry
   * check into the `WHERE` clause of the write itself, so the database —
   * not application code — arbitrates concurrent writers to the same row:
   *
   *  1. Try to atomically increment an *already-active* window via
   *     `updateMany({ where: { key, expireAt: { gte: now } }, ... })`. If
   *     this matches a row, read it back for the current count and return.
   *  2. Otherwise, try to atomically claim an absent-or-expired row via
   *     `updateMany({ where: { key, OR: [expireAt: null, expireAt: { lt:
   *     now }] }, data: { points: 1, expireAt: resetTime } })`. Because
   *     this is itself a single atomic `UPDATE`, if two requests race here
   *     the database serializes them: only the first writer's row still
   *     matches the `WHERE` clause by the time its statement executes —
   *     the second sees 0 rows affected.
   *  3. If step 2 also matched 0 rows, the key has never been seen before —
   *     `create()` it. A concurrent first-ever request for the same key
   *     can race here too; the loser gets a unique-constraint violation
   *     (`P2002`), which retries the loop and increments into the
   *     winner's freshly created window instead of erroring out.
   *
   * A request that loses a race at any step always makes forward progress
   * on retry — the "winner" of that step leaves the row in a state the
   * loser's next attempt can act on (as an active window) — so this
   * converges within a couple of attempts even under heavy concurrency.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const namespacedKey = this.namespacedKey(key)

    for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt++) {
      const now = new Date()

      const activeIncrement = await this.prisma.updateMany({
        where: { key: namespacedKey, expireAt: { gte: now } },
        data: { points: { increment: 1 } },
      })

      if (activeIncrement.count > 0) {
        const record = await this.prisma.findUnique({ where: { key: namespacedKey } })
        if (record !== null) {
          return {
            totalHits: record.points,
            resetTime: record.expireAt ?? new Date(now.getTime() + this.windowMs),
          }
        }
        // The row vanished between our write and this read (e.g. a
        // concurrent resetKey()) — retry from a clean slate.
        continue
      }

      const resetTime = new Date(now.getTime() + this.windowMs)
      const claimedExpired = await this.prisma.updateMany({
        where: { key: namespacedKey, OR: [{ expireAt: null }, { expireAt: { lt: now } }] },
        data: { points: 1, expireAt: resetTime },
      })

      if (claimedExpired.count > 0) {
        return { totalHits: 1, resetTime }
      }

      try {
        const record = await this.prisma.create({
          data: { key: namespacedKey, points: 1, expireAt: resetTime, blockUntil: null },
        })
        return { totalHits: record.points, resetTime: record.expireAt ?? resetTime }
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err
        // Someone else created (or reset) this key concurrently between
        // our updateMany attempts and this create() — retry and increment
        // into their window instead.
      }
    }

    throw new Error(
      `Hypersonic: increment() could not converge for key "${namespacedKey}" after ` +
        `${MAX_INCREMENT_ATTEMPTS} attempts. This should not happen under normal ` +
        'concurrency — if it does, it likely indicates a persistent write failure.',
    )
  }

  async decrement(key: string): Promise<void> {
    await this.prisma.update({
      where: { key: this.namespacedKey(key) },
      data: { points: { decrement: 1 } },
    })
  }

  async resetKey(key: string): Promise<void> {
    await this.prisma.delete({ where: { key: this.namespacedKey(key) } })
  }

  /**
   * Clears every row in the table, across all routes — this is not
   * namespaced by `name`, matching express-rate-limit's own contract for
   * `resetAll()` ("reset everyone's hit counter"). It is also never called
   * by express-rate-limit itself; the library documents it as optional and
   * unused internally.
   */
  async resetAll(): Promise<void> {
    await this.prisma.deleteMany()
  }
}

// ── PrismaBlockStore ──────────────────────────────────────────────────────────

/**
 * A definitely-in-the-past marker used for `expireAt` when blocking (see
 * `PrismaBlockStore.block()`). `PrismaStore.increment()`'s reset-if-expired
 * write only matches a row when `expireAt` is `null` or a past `Date` — so
 * an epoch timestamp always matches, guaranteeing the next `increment()`
 * call, once `isBlocked()` lets a request through again, starts a fresh
 * window rather than treating the row as still active. This holds
 * regardless of how blockDuration relates to windowMs.
 */
const EXPIRED_MARKER = new Date(0)

/**
 * BlockStore backed by the `blockUntil` field on the Prisma `rateLimit` model.
 * Shares the same row as hit-count data so blocking requires no extra table.
 */
export class PrismaBlockStore implements BlockStore {
  constructor(private readonly prisma: PrismaRateLimitModel) {}

  async isBlocked(key: string): Promise<boolean> {
    const record = await this.prisma.findUnique({ where: { key } })
    if (record === null || record.blockUntil === null) return false
    if (new Date() >= record.blockUntil) return false
    return true
  }

  async block(key: string, durationMs: number): Promise<void> {
    const blockUntil = new Date(Date.now() + durationMs)
    await this.prisma.upsert({
      where: { key },
      create: { key, points: 0, expireAt: EXPIRED_MARKER, blockUntil },
      update: { points: 0, expireAt: EXPIRED_MARKER, blockUntil },
    })
  }
}