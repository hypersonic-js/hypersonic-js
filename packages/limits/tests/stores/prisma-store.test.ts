import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaStore, PrismaBlockStore } from '../../src/stores/prisma-store.js'
import type { PrismaRateLimitModel } from '../../src/stores/prisma-store.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<{
  key: string
  points: number
  expireAt: Date | null
  blockUntil: Date | null
}> = {}) {
  return {
    key: 'test-key',
    points: 1,
    expireAt: null,
    blockUntil: null,
    ...overrides,
  }
}

function makePrisma(): { [K in keyof PrismaRateLimitModel]: ReturnType<typeof vi.fn> } {
  return {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  }
}

// ── PrismaStore ───────────────────────────────────────────────────────────────

describe('PrismaStore', () => {
  let prisma: ReturnType<typeof makePrisma>
  const WINDOW_MS = 60_000

  beforeEach(() => {
    prisma = makePrisma()
  })

  describe('increment — new record', () => {
    it('creates a new record when no existing entry is found', async () => {
      prisma.findUnique.mockResolvedValue(null)
      prisma.upsert.mockResolvedValue(makeRecord({ points: 1 }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      expect(prisma.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ points: 1 }) }),
      )
      expect(result.totalHits).toBe(1)
    })

    it('sets a resetTime approximately windowMs from now', async () => {
      prisma.findUnique.mockResolvedValue(null)
      const before = Date.now()
      prisma.upsert.mockResolvedValue(makeRecord({ points: 1 }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      expect(result.resetTime).toBeInstanceOf(Date)
      expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 50)
      expect(result.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + WINDOW_MS + 50)
    })
  })

  describe('increment — expired record', () => {
    it('resets to 1 when the existing record is expired', async () => {
      const expiredAt = new Date(Date.now() - 1000)
      prisma.findUnique.mockResolvedValue(makeRecord({ expireAt: expiredAt }))
      prisma.upsert.mockResolvedValue(makeRecord({ points: 1 }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      const upsertCall = prisma.upsert.mock.calls[0]![0] as { update: { points: number } }
      expect(upsertCall.update.points).toBe(1)
      expect(result.totalHits).toBe(1)
    })
  })

  describe('increment — active record', () => {
    it('increments points for an existing non-expired record', async () => {
      const expireAt = new Date(Date.now() + 30_000)
      prisma.findUnique.mockResolvedValue(makeRecord({ points: 3, expireAt }))
      prisma.upsert.mockResolvedValue(makeRecord({ points: 4, expireAt }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      const upsertCall = prisma.upsert.mock.calls[0]![0] as {
        update: { points: { increment: number }; expireAt: Date }
      }
      expect(upsertCall.update.points).toEqual({ increment: 1 })
      expect(upsertCall.update.expireAt).toEqual(expireAt)
      expect(result.totalHits).toBe(4)
    })

    it('uses the existing expireAt as resetTime for active records', async () => {
      const expireAt = new Date(Date.now() + 30_000)
      prisma.findUnique.mockResolvedValue(makeRecord({ points: 1, expireAt }))
      prisma.upsert.mockResolvedValue(makeRecord({ points: 2, expireAt }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      expect(result.resetTime).toEqual(expireAt)
    })

    it('falls back to a new resetTime when record.expireAt is null', async () => {
      prisma.findUnique.mockResolvedValue(makeRecord({ points: 1, expireAt: null }))
      const before = Date.now()
      prisma.upsert.mockResolvedValue(makeRecord({ points: 2, expireAt: null }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      const result = await store.increment('test-key')

      expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 50)
    })
  })

  describe('decrement', () => {
    it('calls prisma.update with a decrement of 1', async () => {
      prisma.update.mockResolvedValue(makeRecord({ points: 2 }))
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      await store.decrement('test-key')

      expect(prisma.update).toHaveBeenCalledWith({
        where: { key: 'test-key' },
        data: { points: { decrement: 1 } },
      })
    })
  })

  describe('resetKey', () => {
    it('calls prisma.delete with the correct key', async () => {
      prisma.delete.mockResolvedValue(makeRecord())
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      await store.resetKey('test-key')

      expect(prisma.delete).toHaveBeenCalledWith({ where: { key: 'test-key' } })
    })
  })

  describe('resetAll', () => {
    it('calls prisma.deleteMany with no arguments', async () => {
      prisma.deleteMany.mockResolvedValue({ count: 5 })
      const store = new PrismaStore(prisma as unknown as PrismaRateLimitModel, WINDOW_MS)

      await store.resetAll()

      expect(prisma.deleteMany).toHaveBeenCalledOnce()
    })
  })
})

// ── PrismaBlockStore ──────────────────────────────────────────────────────────

describe('PrismaBlockStore', () => {
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    prisma = makePrisma()
  })

  describe('isBlocked', () => {
    it('returns false when no record exists', async () => {
      prisma.findUnique.mockResolvedValue(null)
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      expect(await blockStore.isBlocked('test-key')).toBe(false)
    })

    it('returns false when blockUntil is null', async () => {
      prisma.findUnique.mockResolvedValue(makeRecord({ blockUntil: null }))
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      expect(await blockStore.isBlocked('test-key')).toBe(false)
    })

    it('returns false when blockUntil is in the past', async () => {
      const blockUntil = new Date(Date.now() - 1000)
      prisma.findUnique.mockResolvedValue(makeRecord({ blockUntil }))
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      expect(await blockStore.isBlocked('test-key')).toBe(false)
    })

    it('returns true when blockUntil is in the future', async () => {
      const blockUntil = new Date(Date.now() + 60_000)
      prisma.findUnique.mockResolvedValue(makeRecord({ blockUntil }))
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      expect(await blockStore.isBlocked('test-key')).toBe(true)
    })

    it('queries by the correct key', async () => {
      prisma.findUnique.mockResolvedValue(null)
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      await blockStore.isBlocked('specific-key')
      expect(prisma.findUnique).toHaveBeenCalledWith({ where: { key: 'specific-key' } })
    })
  })

  describe('block', () => {
    it('upserts a record with blockUntil set to now + durationMs', async () => {
      prisma.upsert.mockResolvedValue(makeRecord())
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)
      const before = Date.now()

      await blockStore.block('test-key', 300_000)

      const upsertCall = prisma.upsert.mock.calls[0]![0] as {
        create: { blockUntil: Date }
        update: { blockUntil: Date }
      }
      expect(upsertCall.create.blockUntil.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 10)
      expect(upsertCall.create.blockUntil.getTime()).toBeLessThanOrEqual(Date.now() + 300_000 + 10)
      expect(upsertCall.update.blockUntil).toEqual(upsertCall.create.blockUntil)
    })

    it('sets points to 0 and expireAt to null in the upsert', async () => {
      prisma.upsert.mockResolvedValue(makeRecord())
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)

      await blockStore.block('test-key', 5000)

      const upsertCall = prisma.upsert.mock.calls[0]![0] as {
        create: { points: number; expireAt: Date | null }
      }
      expect(upsertCall.create.points).toBe(0)
      expect(upsertCall.create.expireAt).toBeNull()
    })
  })
})
