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

// ── PrismaStore ───────────────────────────────────────────────────────────────

/**
 * express-rate-limit Store backed by the Prisma `rateLimit` model.
 *
 * Window semantics: each `increment` call starts a new window when the
 * record is absent or expired, and extends within the existing window
 * otherwise. This is a fixed-window strategy — suitable for single-server
 * or low-concurrency scenarios. Use the Redis backend for distributed
 * environments where atomic window management is required.
 */
export class PrismaStore implements Store {
  constructor(
    private readonly prisma: PrismaRateLimitModel,
    private readonly windowMs: number,
  ) {}

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date()
    const existing = await this.prisma.findUnique({ where: { key } })
    const isExpired =
      existing === null ||
      (existing.expireAt !== null && existing.expireAt < now)

    const resetTime = new Date(now.getTime() + this.windowMs)

    if (isExpired) {
      const record = await this.prisma.upsert({
        where: { key },
        create: { key, points: 1, expireAt: resetTime, blockUntil: null },
        update: { points: 1, expireAt: resetTime },
      })
      return { totalHits: record.points, resetTime }
    }

    // Within window — increment hit count, preserve existing expiry
    const record = await this.prisma.upsert({
      where: { key },
      create: { key, points: 1, expireAt: resetTime, blockUntil: null },
      update: { points: { increment: 1 }, expireAt: existing.expireAt },
    })

    return {
      totalHits: record.points,
      resetTime: record.expireAt ?? resetTime,
    }
  }

  async decrement(key: string): Promise<void> {
    await this.prisma.update({
      where: { key },
      data: { points: { decrement: 1 } },
    })
  }

  async resetKey(key: string): Promise<void> {
    await this.prisma.delete({ where: { key } })
  }

  async resetAll(): Promise<void> {
    await this.prisma.deleteMany()
  }
}

// ── PrismaBlockStore ──────────────────────────────────────────────────────────

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
      create: { key, points: 0, expireAt: null, blockUntil },
      update: { points: 0, expireAt: null, blockUntil },
    })
  }
}
