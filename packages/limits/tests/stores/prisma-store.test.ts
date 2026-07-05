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

/** A duck-typed Prisma unique-constraint violation (error code P2002). */
function makeUniqueConstraintError(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed on the fields: (`key`)'), {
    code: 'P2002',
  })
}

function makePrisma(): { [K in keyof PrismaRateLimitModel]: ReturnType<typeof vi.fn> } {
  return {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    updateManyAndReturn: vi.fn(),
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
  const NAME = 'test-route'

  /** Builds a PrismaStore against the shared mock, defaulting windowMs/name so individual tests only override what they care about. */
  function makeStore(windowMs = WINDOW_MS, name = NAME): PrismaStore {
    return new PrismaStore(prisma as unknown as PrismaRateLimitModel, windowMs, name)
  }

  beforeEach(() => {
    prisma = makePrisma()
    prisma.updateManyAndReturn.mockResolvedValue([])
  })

  describe('increment — brand new key', () => {
    it('creates a new record when neither the active nor the reset write matches any row', async () => {
      prisma.updateMany.mockResolvedValueOnce({ count: 0 }) // reset-check: nothing to reset either
      prisma.create.mockResolvedValue(makeRecord({ points: 1 }))
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ key: 'test-route:test-key', points: 1, blockUntil: null }) }),
      )
      expect(result.totalHits).toBe(1)
    })

    it('sets a resetTime approximately windowMs from now', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 })
      const before = Date.now()
      prisma.create.mockResolvedValue(makeRecord({ points: 1 }))
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(result.resetTime).toBeInstanceOf(Date)
      expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 50)
      expect(result.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + WINDOW_MS + 50)
    })
  })

  describe('increment — expired record', () => {
    it('resets to 1 via the atomic reset write, without ever calling create()', async () => {
      prisma.updateMany.mockResolvedValueOnce({ count: 1 }) // reset-check: atomically claims the row
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.create).not.toHaveBeenCalled()
      expect(prisma.updateMany).toHaveBeenCalledTimes(1)
      expect(result.totalHits).toBe(1)
    })

    it('does not read the row back for the resolved reset write — resetTime is computed locally', async () => {
      prisma.updateMany.mockResolvedValueOnce({ count: 1 })
      const before = Date.now()
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.findUnique).not.toHaveBeenCalled()
      expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 50)
    })
  })

  describe('increment — row previously blocked then unblocked', () => {
    it('treats the row as expired once the block has lifted, rather than getting stuck', async () => {
      // Mirrors what PrismaBlockStore.block() writes: points reset to 0,
      // expireAt set to a definitely-past marker (not null). The
      // reset-if-expired write's WHERE clause matches any past expireAt,
      // so this converges in a single atomic write. Regression guard for
      // the bug where a null expireAt (the old behaviour) made increment()
      // treat the row as an active, never-expiring window forever.
      prisma.updateMany.mockResolvedValueOnce({ count: 1 }) // reset-check hits — atomically claims the row
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.create).not.toHaveBeenCalled()
      expect(result.totalHits).toBe(1)
    })
  })

  describe('increment — active record', () => {
    it('atomically increments an active window and returns the count from the same write', async () => {
      const expireAt = new Date(Date.now() + 30_000)
      prisma.updateManyAndReturn.mockResolvedValueOnce([makeRecord({ points: 4, expireAt })])
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ data: { points: { increment: 1 } } }),
      )
      // No separate read-back call — the count comes from updateManyAndReturn's
      // own result, which is exactly what closes the race this replaced.
      expect(prisma.findUnique).not.toHaveBeenCalled()
      expect(result.totalHits).toBe(4)
      expect(result.resetTime).toEqual(expireAt)
    })

    it('falls back to a new resetTime when the returned record has a null expireAt', async () => {
      prisma.updateManyAndReturn.mockResolvedValueOnce([makeRecord({ points: 2, expireAt: null })])
      const before = Date.now()
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 50)
    })
  })

  describe('increment — concurrency retries', () => {
    it('retries and increments into a concurrent winner\'s window after a unique-constraint race on create()', async () => {
      prisma.updateManyAndReturn
        .mockResolvedValueOnce([]) // attempt 1: active-check misses
        .mockResolvedValueOnce([makeRecord({ points: 2, expireAt: new Date(Date.now() + 30_000) })]) // attempt 2: active-check now hits the winner's row
      prisma.updateMany.mockResolvedValueOnce({ count: 0 }) // attempt 1: reset-check misses too
      prisma.create.mockRejectedValueOnce(makeUniqueConstraintError()) // attempt 1: lost the race
      const store = makeStore()

      const result = await store.increment('test-key')

      expect(prisma.create).toHaveBeenCalledOnce()
      expect(prisma.updateManyAndReturn).toHaveBeenCalledTimes(2)
      expect(prisma.updateMany).toHaveBeenCalledTimes(1)
      expect(result.totalHits).toBe(2)
    })

    it('propagates a non-unique-constraint error from create() rather than retrying', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 })
      prisma.create.mockRejectedValue(new Error('connection refused'))
      const store = makeStore()

      await expect(store.increment('test-key')).rejects.toThrow('connection refused')
    })

    it('throws a descriptive error if it cannot converge within the attempt limit', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 })
      prisma.create.mockRejectedValue(makeUniqueConstraintError())
      const store = makeStore()

      await expect(store.increment('test-key')).rejects.toThrow(/could not converge/)
    })
  })

  describe('increment — key namespacing', () => {
    it('prefixes the key sent to Prisma with the store\'s name', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 })
      prisma.create.mockResolvedValue(makeRecord({ points: 1 }))
      const store = makeStore(WINDOW_MS, 'login')

      await store.increment('1.2.3.4')

      expect(prisma.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: 'login:1.2.3.4' }) }),
      )
      expect(prisma.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: 'login:1.2.3.4' }) }),
      )
      expect(prisma.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ key: 'login:1.2.3.4' }) }),
      )
    })

    it('namespaces the key in the active-window path too', async () => {
      prisma.updateManyAndReturn.mockResolvedValueOnce([
        makeRecord({ points: 2, expireAt: new Date(Date.now() + 30_000) }),
      ])
      const store = makeStore(WINDOW_MS, 'login')

      await store.increment('1.2.3.4')

      expect(prisma.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ key: 'login:1.2.3.4' }) }),
      )
    })

    it('includes the namespaced key in the convergence-failure error message', async () => {
      prisma.updateMany.mockResolvedValue({ count: 0 })
      prisma.create.mockRejectedValue(makeUniqueConstraintError())
      const store = makeStore(WINDOW_MS, 'login')

      await expect(store.increment('1.2.3.4')).rejects.toThrow('login:1.2.3.4')
    })

    it('two stores with different names never collide on the same raw client key', async () => {
      // Regression guard: without namespacing, two routes sharing a Prisma
      // client would read/write the exact same row for the same client,
      // silently combining their counters — see PrismaStore's class doc
      // comment and the "key namespacing" section of its constructor.
      prisma.updateMany.mockResolvedValue({ count: 0 })
      prisma.create.mockResolvedValue(makeRecord({ points: 1 }))
      const loginStore = makeStore(WINDOW_MS, 'login')
      const signupStore = makeStore(WINDOW_MS, 'signup')

      await loginStore.increment('1.2.3.4')
      await signupStore.increment('1.2.3.4')

      const keysSentToCreate = prisma.create.mock.calls.map(
        (call) => (call[0] as { data: { key: string } }).data.key,
      )
      expect(keysSentToCreate).toEqual(['login:1.2.3.4', 'signup:1.2.3.4'])
    })
  })

  describe('decrement', () => {
    it('calls prisma.update with a decrement of 1', async () => {
      prisma.update.mockResolvedValue(makeRecord({ points: 2 }))
      const store = makeStore()

      await store.decrement('test-key')

      expect(prisma.update).toHaveBeenCalledWith({
        where: { key: 'test-route:test-key' },
        data: { points: { decrement: 1 } },
      })
    })
  })

  describe('resetKey', () => {
    it('calls prisma.delete with the correct key', async () => {
      prisma.delete.mockResolvedValue(makeRecord())
      const store = makeStore()

      await store.resetKey('test-key')

      expect(prisma.delete).toHaveBeenCalledWith({ where: { key: 'test-route:test-key' } })
    })
  })

  describe('resetAll', () => {
    it('calls prisma.deleteMany with no arguments', async () => {
      prisma.deleteMany.mockResolvedValue({ count: 5 })
      const store = makeStore()

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

    it('sets points to 0 and expireAt to a definitely-past marker (not null) in the upsert', async () => {
      prisma.upsert.mockResolvedValue(makeRecord())
      const blockStore = new PrismaBlockStore(prisma as unknown as PrismaRateLimitModel)

      await blockStore.block('test-key', 5000)

      const upsertCall = prisma.upsert.mock.calls[0]![0] as {
        create: { points: number; expireAt: Date | null }
        update: { points: number; expireAt: Date | null }
      }
      expect(upsertCall.create.points).toBe(0)
      // Regression guard: a null expireAt would make PrismaStore.increment()
      // treat this row as an active, never-expiring window (see the
      // EXPIRED_MARKER comment in prisma-store.ts) and the counter would
      // never roll over again once blocked.
      expect(upsertCall.create.expireAt).not.toBeNull()
      expect(upsertCall.create.expireAt!.getTime()).toBeLessThan(Date.now())
      expect(upsertCall.update.expireAt).toEqual(upsertCall.create.expireAt)
    })
  })
})