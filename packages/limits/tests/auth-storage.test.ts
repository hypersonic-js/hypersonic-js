import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Redis mock ────────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn()
const mockRedisSetEx = vi.fn()
const mockRedisConnect = vi.fn().mockResolvedValue(undefined)
const mockRedisOn = vi.fn().mockReturnThis()
const mockRedisQuit = vi.fn().mockResolvedValue('OK')

const mockRedisClient = {
  get: mockRedisGet,
  setEx: mockRedisSetEx,
  connect: mockRedisConnect,
  on: mockRedisOn,
  quit: mockRedisQuit,
}

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}))

import {
  buildMemoryAuthStorage,
  buildDatabaseAuthStorage,
  buildRedisAuthStorage,
  buildAuthLimitsConfig,
} from '../src/auth-storage.js'
import type { PrismaAuthRateLimitModel } from '../src/stores/prisma-store.js'
import type { LimitsConfig } from '../src/types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrismaAuthRateLimit(): { [K in keyof PrismaAuthRateLimitModel]: ReturnType<typeof vi.fn> } {
  return {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  }
}

// ── buildMemoryAuthStorage ────────────────────────────────────────────────────

describe('buildMemoryAuthStorage', () => {
  it('returns rateLimit.enabled: true', () => {
    const result = buildMemoryAuthStorage()
    expect(result.rateLimit?.enabled).toBe(true)
  })

  it('does not include customStorage', () => {
    const result = buildMemoryAuthStorage()
    expect(result.rateLimit?.customStorage).toBeUndefined()
  })

  it('does not include a secondaryStorage field on the returned object', () => {
    const result = buildMemoryAuthStorage()
    expect('secondaryStorage' in result).toBe(false)
  })

  it('resolves close() without throwing', async () => {
    const result = buildMemoryAuthStorage()
    await expect(result.close()).resolves.toBeUndefined()
  })
})

// ── buildDatabaseAuthStorage ──────────────────────────────────────────────────

describe('buildDatabaseAuthStorage', () => {
  let authRateLimit: ReturnType<typeof makePrismaAuthRateLimit>

  beforeEach(() => {
    authRateLimit = makePrismaAuthRateLimit()
    vi.clearAllMocks()
  })

  it('returns rateLimit.enabled: true', () => {
    const result = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
    expect(result.rateLimit?.enabled).toBe(true)
  })

  it('includes a customStorage object', () => {
    const result = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
    expect(result.rateLimit?.customStorage).toBeDefined()
  })

  it('does not include a secondaryStorage field on the returned object', () => {
    const result = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
    expect('secondaryStorage' in result).toBe(false)
  })

  it('resolves close() without throwing', async () => {
    const result = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
    await expect(result.close()).resolves.toBeUndefined()
  })

  describe('customStorage.get', () => {
    it('returns null when no record exists', async () => {
      authRateLimit.findUnique.mockResolvedValue(null)
      const { rateLimit } = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
      const result = await rateLimit!.customStorage!.get('some-key')
      expect(result).toBeNull()
    })

    it('returns key, count, and lastRequest as a number when record exists', async () => {
      authRateLimit.findUnique.mockResolvedValue({
        key: 'some-key',
        count: 5,
        lastRequest: BigInt(1_700_000_000_000),
      })
      const { rateLimit } = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
      const result = await rateLimit!.customStorage!.get('some-key')
      expect(result).toEqual({ key: 'some-key', count: 5, lastRequest: 1_700_000_000_000 })
    })

    it('queries with the correct key', async () => {
      authRateLimit.findUnique.mockResolvedValue(null)
      const { rateLimit } = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
      await rateLimit!.customStorage!.get('my-key')
      expect(authRateLimit.findUnique).toHaveBeenCalledWith({ where: { key: 'my-key' } })
    })
  })

  describe('customStorage.set', () => {
    it('upserts with count and lastRequest as BigInt', async () => {
      authRateLimit.upsert.mockResolvedValue({
        key: 'some-key',
        count: 3,
        lastRequest: BigInt(1_700_000_000_000),
      })
      const { rateLimit } = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
      await rateLimit!.customStorage!.set('some-key', {
        key: 'some-key',
        count: 3,
        lastRequest: 1_700_000_000_000,
      })

      expect(authRateLimit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'some-key' },
          create: { key: 'some-key', count: 3, lastRequest: BigInt(1_700_000_000_000) },
          update: { count: 3, lastRequest: BigInt(1_700_000_000_000) },
        }),
      )
    })
  })
})

// ── buildRedisAuthStorage ─────────────────────────────────────────────────────
// Rebuilt around rateLimit.customStorage — buildRedisAuthStorage no longer
// touches Better Auth's secondaryStorage at all (see the function's doc
// comment in ../src/auth-storage.ts for why: secondaryStorage is a shared
// store also used for session/verification data, so wiring rate limiting
// through it would have silently moved that other data into Redis too).

describe('buildRedisAuthStorage', () => {
  const WINDOW = 10

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisConnect.mockResolvedValue(undefined)
    mockRedisOn.mockReturnThis()
    mockRedisQuit.mockResolvedValue('OK')
  })

  it('returns rateLimit.enabled: true', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect(result.rateLimit?.enabled).toBe(true)
  })

  it('includes a customStorage object', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect(result.rateLimit?.customStorage).toBeDefined()
  })

  it('does not include a secondaryStorage field on the returned object', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect('secondaryStorage' in result).toBe(false)
  })

  it('does not set rateLimit.storage to "secondary-storage"', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect(result.rateLimit?.storage).toBeUndefined()
  })

  it('connects a redis client with the provided URL', async () => {
    const { createClient } = await import('redis')
    await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' })
  })

  it('registers an error handler labeled "Auth"', async () => {
    await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    expect(mockRedisOn).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('error handler does not throw when invoked', async () => {
    await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
    const errorHandler = mockRedisOn.mock.calls.find(
      ([event]: [string]) => event === 'error',
    )![1] as (err: unknown) => void
    expect(() => errorHandler(new Error('conn failed'))).not.toThrow()
  })

  describe('close()', () => {
    it('calls the redis client quit()', async () => {
      const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      await result.close()
      expect(mockRedisQuit).toHaveBeenCalledOnce()
    })

    it('resolves without throwing', async () => {
      const result = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      await expect(result.close()).resolves.toBeUndefined()
    })
  })

  describe('customStorage.get', () => {
    it('calls client.get with the key', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ key: 'my-key', count: 2, lastRequest: 123 }))
      const { rateLimit } = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      await rateLimit!.customStorage!.get('my-key')
      expect(mockRedisGet).toHaveBeenCalledWith('my-key')
    })

    it('returns the parsed record when one exists', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ key: 'my-key', count: 2, lastRequest: 123 }))
      const { rateLimit } = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      const result = await rateLimit!.customStorage!.get('my-key')
      expect(result).toEqual({ key: 'my-key', count: 2, lastRequest: 123 })
    })

    it('returns null when the key does not exist', async () => {
      mockRedisGet.mockResolvedValue(null)
      const { rateLimit } = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      expect(await rateLimit!.customStorage!.get('missing')).toBeNull()
    })
  })

  describe('customStorage.set', () => {
    it('JSON-encodes the record before writing', async () => {
      mockRedisSetEx.mockResolvedValue('OK')
      const { rateLimit } = await buildRedisAuthStorage('redis://localhost:6379', WINDOW)
      await rateLimit!.customStorage!.set('my-key', { key: 'my-key', count: 4, lastRequest: 999 })
      expect(mockRedisSetEx).toHaveBeenCalledWith(
        'my-key',
        WINDOW,
        JSON.stringify({ key: 'my-key', count: 4, lastRequest: 999 }),
      )
    })

    it('always writes with setEx using the configured window as the TTL', async () => {
      mockRedisSetEx.mockResolvedValue('OK')
      const { rateLimit } = await buildRedisAuthStorage('redis://localhost:6379', 42)
      await rateLimit!.customStorage!.set('another-key', { key: 'another-key', count: 1, lastRequest: 1 })
      expect(mockRedisSetEx).toHaveBeenCalledWith('another-key', 42, expect.any(String))
    })
  })
})

// ── buildAuthLimitsConfig ─────────────────────────────────────────────────────

describe('buildAuthLimitsConfig', () => {
  let authRateLimit: ReturnType<typeof makePrismaAuthRateLimit>

  beforeEach(() => {
    authRateLimit = makePrismaAuthRateLimit()
    vi.clearAllMocks()
    mockRedisConnect.mockResolvedValue(undefined)
    mockRedisOn.mockReturnThis()
    mockRedisQuit.mockResolvedValue('OK')
  })

  const memoryConfig: LimitsConfig = { backend: 'memory' }
  const databaseConfig: LimitsConfig = { backend: 'database' }
  const redisConfig: LimitsConfig = { backend: 'redis', window: 10 }

  describe('memory backend', () => {
    it('returns memory auth storage', async () => {
      const result = await buildAuthLimitsConfig(memoryConfig, {})
      expect(result.rateLimit?.enabled).toBe(true)
    })

    it('returns a close function', async () => {
      const result = await buildAuthLimitsConfig(memoryConfig, {})
      await expect(result.close()).resolves.toBeUndefined()
    })
  })

  describe('database backend', () => {
    it('throws when prisma is not provided', async () => {
      await expect(buildAuthLimitsConfig(databaseConfig, {})).rejects.toThrow(
        'prisma must be provided',
      )
    })

    it('returns database auth storage when prisma is provided', async () => {
      const result = await buildAuthLimitsConfig(databaseConfig, {}, {
        authRateLimit: authRateLimit as unknown as PrismaAuthRateLimitModel,
      })
      expect(result.rateLimit?.customStorage).toBeDefined()
    })

    it('returns a close function', async () => {
      const result = await buildAuthLimitsConfig(databaseConfig, {}, {
        authRateLimit: authRateLimit as unknown as PrismaAuthRateLimitModel,
      })
      await expect(result.close()).resolves.toBeUndefined()
    })
  })

  describe('redis backend', () => {
    it('throws when REDIS_URL is not set', async () => {
      await expect(buildAuthLimitsConfig(redisConfig, {})).rejects.toThrow(
        'REDIS_URL must be set',
      )
    })

    it('throws when REDIS_URL is an empty string', async () => {
      await expect(buildAuthLimitsConfig(redisConfig, { REDIS_URL: '' })).rejects.toThrow(
        'REDIS_URL must be set',
      )
    })

    it('returns redis auth storage when REDIS_URL is provided', async () => {
      const result = await buildAuthLimitsConfig(redisConfig, { REDIS_URL: 'redis://localhost:6379' })
      expect(result.rateLimit?.customStorage).toBeDefined()
    })

    it('passes config.window through as the Redis TTL', async () => {
      mockRedisSetEx.mockResolvedValue('OK')
      const result = await buildAuthLimitsConfig(
        { backend: 'redis', window: 77 },
        { REDIS_URL: 'redis://localhost:6379' },
      )
      await result.rateLimit!.customStorage!.set('k', { key: 'k', count: 1, lastRequest: 1 })
      expect(mockRedisSetEx).toHaveBeenCalledWith('k', 77, expect.any(String))
    })

    it('close() calls the redis client quit()', async () => {
      const result = await buildAuthLimitsConfig(redisConfig, { REDIS_URL: 'redis://localhost:6379' })
      await result.close()
      expect(mockRedisQuit).toHaveBeenCalledOnce()
    })
  })
})