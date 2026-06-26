import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// express-rate-limit mock — captures the handler and skip options, executes
// configurable behaviour so we can test the compound middleware logic
const mockRateLimiterMiddleware = vi.fn()
const mockRateLimit = vi.fn(() => mockRateLimiterMiddleware)

vi.mock('express-rate-limit', () => ({
  rateLimit: mockRateLimit,
  MemoryStore: vi.fn(() => ({ increment: vi.fn(), decrement: vi.fn(), resetKey: vi.fn() })),
}))

// rate-limit-redis mock
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(() => ({ __type: 'RedisStore' })),
}))

// Redis mock
const mockRedisConnect = vi.fn().mockResolvedValue(undefined)
const mockRedisOn = vi.fn().mockReturnThis()
const mockRedisSet = vi.fn().mockResolvedValue('OK')
const mockRedisExists = vi.fn().mockResolvedValue(0)
const mockRedisSendCommand = vi.fn()

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: mockRedisConnect,
    on: mockRedisOn,
    set: mockRedisSet,
    exists: mockRedisExists,
    sendCommand: mockRedisSendCommand,
  })),
}))

import { createLimiter } from '../src/middleware.js'
import type { LimitsConfig } from '../src/types.js'
import type { PrismaRateLimitModel } from '../src/stores/prisma-store.js'

// ── Request / Response helpers ────────────────────────────────────────────────

function makeReq(ip = '1.2.3.4'): Partial<Request> {
  return { ip }
}

function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

const next: NextFunction = vi.fn()

function makePrismaRateLimitModel(): { [K in keyof PrismaRateLimitModel]: ReturnType<typeof vi.fn> } {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ key: 'k', points: 1, expireAt: null, blockUntil: null }),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  }
}

// ── createLimiter — backend validation ────────────────────────────────────────

describe('createLimiter — backend selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisConnect.mockResolvedValue(undefined)
    mockRedisOn.mockReturnThis()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
  })

  it('returns a LimitFactory for the memory backend', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    expect(typeof limit).toBe('function')
  })

  it('the memory factory returns a RequestHandler', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000 })
    expect(typeof handler).toBe('function')
  })

  it('throws when redis backend is requested but REDIS_URL is missing', async () => {
    await expect(
      createLimiter({ config: { backend: 'redis' }, env: {} }),
    ).rejects.toThrow('REDIS_URL must be set')
  })

  it('returns a LimitFactory for the redis backend when REDIS_URL is set', async () => {
    const limit = await createLimiter({
      config: { backend: 'redis' },
      env: { REDIS_URL: 'redis://localhost:6379' },
    })
    expect(typeof limit).toBe('function')
  })

  it('throws when database backend is requested but prisma is not provided', async () => {
    await expect(
      createLimiter({ config: { backend: 'database' }, env: {} }),
    ).rejects.toThrow('prisma must be provided')
  })

  it('returns a LimitFactory for the database backend when prisma is provided', async () => {
    const prisma = { rateLimit: makePrismaRateLimitModel() as unknown as PrismaRateLimitModel }
    const limit = await createLimiter({ config: { backend: 'database' }, env: {}, prisma })
    expect(typeof limit).toBe('function')
  })

  it('throws for an unknown backend', async () => {
    await expect(
      createLimiter({ config: { backend: 'unknown' as LimitsConfig['backend'] }, env: {} }),
    ).rejects.toThrow('unknown limits backend')
  })
})

// ── rateLimit options forwarding ──────────────────────────────────────────────

describe('createLimiter — rateLimit options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
  })

  it('passes windowMs and limit to rateLimit()', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    limit({ requests: 5, windowMs: 30_000 })
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ windowMs: 30_000, limit: 5 }),
    )
  })

  it('uses draft-8 standard headers', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    limit({ requests: 10, windowMs: 60_000 })
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ standardHeaders: 'draft-8', legacyHeaders: false }),
    )
  })

  it('includes a handler in the rateLimit options', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    limit({ requests: 10, windowMs: 60_000 })
    const options = mockRateLimit.mock.calls[0]![0] as Record<string, unknown>
    expect(typeof options['handler']).toBe('function')
  })
})

// ── Compound middleware — without blockDuration ───────────────────────────────

describe('createLimiter — no blockDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
  })

  it('returns the raw rateLimit middleware when blockDuration is undefined', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000 })
    // Without blockDuration the compound wrapper is skipped —
    // the returned handler IS the mockRateLimiterMiddleware
    expect(handler).toBe(mockRateLimiterMiddleware)
  })

  it('calls next when rateLimit middleware calls next', async () => {
    mockRateLimiterMiddleware.mockImplementation((_req: unknown, _res: unknown, n: NextFunction) => n())
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000 })
    const req = makeReq()
    const res = makeRes()
    handler(req as Request, res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

// ── Compound middleware — with blockDuration ──────────────────────────────────

describe('createLimiter — with blockDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
    mockRedisExists.mockResolvedValue(0)
    mockRedisSet.mockResolvedValue('OK')
  })

  it('returns a wrapper function (not the raw limiter) when blockDuration is set', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000, blockDuration: 300_000 })
    // The wrapper is a different function (an async arrow fn)
    expect(handler).not.toBe(mockRateLimiterMiddleware)
  })

  it('passes the request through to the rate limiter when client is not blocked', async () => {
    mockRateLimiterMiddleware.mockImplementation((_req: unknown, _res: unknown, n: NextFunction) => n())
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000, blockDuration: 300_000 })
    const req = makeReq()
    const res = makeRes()
    const nextFn = vi.fn()

    await handler(req as Request, res as unknown as Response, nextFn)

    expect(mockRateLimiterMiddleware).toHaveBeenCalledOnce()
    expect(nextFn).toHaveBeenCalledOnce()
  })

  it('returns 429 immediately when client is already blocked', async () => {
    // Simulate a blocked client by pre-blocking via the memory store
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const _handler = limit({ requests: 1, windowMs: 60_000, blockDuration: 300_000 })
    const req = makeReq('blocked-ip')
    const res = makeRes()
    const nextFn = vi.fn()

    // First: manually block the client via the handler callback
    const options = mockRateLimit.mock.calls[0]![0] as { handler: (req: Request, res: Response) => void }
    await (options.handler as unknown as (req: Partial<Request>, res: ReturnType<typeof makeRes>) => Promise<void>)(req, res)
    // Wait for async block write
    await new Promise((r) => setTimeout(r, 10))

    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
    const handler2 = limit({ requests: 1, windowMs: 60_000, blockDuration: 300_000 })

    await handler2(req as Request, res as unknown as Response, nextFn)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }))
    expect(mockRateLimiterMiddleware).not.toHaveBeenCalled()
  })

  it('uses "unknown" as the key when req.ip is undefined', async () => {
    mockRateLimiterMiddleware.mockImplementation((_req: unknown, _res: unknown, n: NextFunction) => n())
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const handler = limit({ requests: 10, windowMs: 60_000, blockDuration: 300_000 })
    const req = makeReq(undefined as unknown as string)
    ;(req as { ip: undefined }).ip = undefined
    const res = makeRes()
    const nextFn = vi.fn()

    // Should not throw — falls back to 'unknown'
    await expect(
      handler(req as Request, res as unknown as Response, nextFn),
    ).resolves.not.toThrow()
  })

  it('uses the custom message in 429 responses', async () => {
    mockRateLimiterMiddleware.mockImplementation((_req: unknown, _res: unknown, n: NextFunction) => n())
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    const _handler = limit({ requests: 10, windowMs: 60_000, blockDuration: 300_000, message: 'Slow down!' })
    const options = mockRateLimit.mock.calls[0]![0] as {
      handler: (req: Partial<Request>, res: ReturnType<typeof makeRes>) => void
      message: { message: string }
    }
    expect(options.message.message).toBe('Slow down!')
  })
})

// ── handler callback — block on limit exceeded ────────────────────────────────

describe('createLimiter — handler blocks client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)
  })

  it('handler responds with 429', async () => {
    const limit = await createLimiter({ config: { backend: 'memory' }, env: {} })
    limit({ requests: 5, windowMs: 60_000, blockDuration: 300_000 })
    const options = mockRateLimit.mock.calls[0]![0] as {
      handler: (req: Partial<Request>, res: ReturnType<typeof makeRes>) => Promise<void>
    }
    const req = makeReq()
    const res = makeRes()
    await options.handler(req, res)
    await new Promise((r) => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('handler still returns 429 even if blockStore.block rejects', async () => {
    // Force the block to fail by providing a bad IP that causes internal error
    const prisma = { rateLimit: makePrismaRateLimitModel() as unknown as PrismaRateLimitModel }
    prisma.rateLimit.upsert = vi.fn().mockRejectedValue(new Error('DB error'))
    const limit = await createLimiter({ config: { backend: 'database' }, env: {}, prisma })
    limit({ requests: 5, windowMs: 60_000, blockDuration: 300_000 })
    const options = mockRateLimit.mock.calls[0]![0] as {
      handler: (req: Partial<Request>, res: ReturnType<typeof makeRes>) => Promise<void>
    }
    const req = makeReq()
    const res = makeRes()
    await options.handler(req, res)
    await new Promise((r) => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('handler does not attempt to block when blockDuration is undefined', async () => {
    const prisma = { rateLimit: makePrismaRateLimitModel() as unknown as PrismaRateLimitModel }
    const limit = await createLimiter({ config: { backend: 'database' }, env: {}, prisma })
    limit({ requests: 5, windowMs: 60_000 })
    const options = mockRateLimit.mock.calls[0]![0] as {
      handler: (req: Partial<Request>, res: ReturnType<typeof makeRes>) => Promise<void>
    }
    const req = makeReq()
    const res = makeRes()
    await options.handler(req, res)
    await new Promise((r) => setTimeout(r, 10))
    // blockUntil upsert should NOT have been called since no blockDuration
    expect(prisma.rateLimit.upsert).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
  })
})

// ── database backend — per-call PrismaStore ───────────────────────────────────

describe('createLimiter — database backend PrismaStore per call', () => {
  it('each limit() call passes its own windowMs to PrismaStore', async () => {
    const prisma = { rateLimit: makePrismaRateLimitModel() as unknown as PrismaRateLimitModel }
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue(mockRateLimiterMiddleware)

    const limit = await createLimiter({ config: { backend: 'database' }, env: {}, prisma })

    limit({ requests: 10, windowMs: 60_000 })
    limit({ requests: 5, windowMs: 30_000 })

    // rateLimit was called twice with different stores
    expect(mockRateLimit).toHaveBeenCalledTimes(2)
    const [firstOptions, secondOptions] = mockRateLimit.mock.calls as [
      [{ windowMs: number }],
      [{ windowMs: number }],
    ]
    expect(firstOptions[0].windowMs).toBe(60_000)
    expect(secondOptions[0].windowMs).toBe(30_000)
  })
})