import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Redis mock ────────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()
const mockRedisSetEx = vi.fn()
const mockRedisDel = vi.fn()
const mockRedisConnect = vi.fn().mockResolvedValue(undefined)
const mockRedisOn = vi.fn().mockReturnThis()
const mockRedisQuit = vi.fn().mockResolvedValue('OK')

const mockRedisClient = {
  get: mockRedisGet,
  set: mockRedisSet,
  setEx: mockRedisSetEx,
  del: mockRedisDel,
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

  it('does not include secondaryStorage', () => {
    const result = buildMemoryAuthStorage()
    expect(result.secondaryStorage).toBeUndefined()
  })

  it('does not include customStorage', () => {
    const result = buildMemoryAuthStorage()
    expect(result.rateLimit?.customStorage).toBeUndefined()
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

  it('does not include secondaryStorage', () => {
    const result = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
    expect(result.secondaryStorage).toBeUndefined()
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

    it('returns count and lastRequest as a number when record exists', async () => {
      authRateLimit.findUnique.mockResolvedValue({
        key: 'some-key',
        count: 5,
        lastRequest: BigInt(1_700_000_000_000),
      })
      const { rateLimit } = buildDatabaseAuthStorage(authRateLimit as unknown as PrismaAuthRateLimitModel)
      const result = await rateLimit!.customStorage!.get('some-key')
      expect(result).toEqual({ count: 5, lastRequest: 1_700_000_000_000 })
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
      await rateLimit!.customStorage!.set('some-key', { count: 3, lastRequest: 1_700_000_000_000 })

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

describe('buildRedisAuthStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisConnect.mockResolvedValue(undefined)
    mockRedisOn.mockReturnThis()
    mockRedisQuit.mockResolvedValue('OK')
  })

  it('returns rateLimit.storage: secondary-storage', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379')
    expect(result.rateLimit?.storage).toBe('secondary-storage')
  })

  it('returns rateLimit.enabled: true', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379')
    expect(result.rateLimit?.enabled).toBe(true)
  })

  it('includes a secondaryStorage object', async () => {
    const result = await buildRedisAuthStorage('redis://localhost:6379')
    expect(result.secondaryStorage).toBeDefined()
  })

  it('error handler does not throw when invoked', async () => {
    await buildRedisAuthStorage('redis://localhost:6379')
    const errorHandler = mockRedisOn.mock.calls.find(
      ([event]: [string]) => event === 'error',
    )![1] as (err: unknown) => void
    expect(() => errorHandler(new Error('conn failed'))).not.toThrow()
  })

  describe('close()', () => {
    it('calls the redis client quit()', async () => {
      const result = await buildRedisAuthStorage('redis://localhost:6379')
      await result.close()
      expect(mockRedisQuit).toHaveBeenCalledOnce()
    })

    it('resolves without throwing', async () => {
      const result = await buildRedisAuthStorage('redis://localhost:6379')
      await expect(result.close()).resolves.toBeUndefined()
    })
  })

  describe('secondaryStorage.get', () => {
    it('calls client.get with the key', async () => {
      mockRedisGet.mockResolvedValue('stored-value')
      const { secondaryStorage } = await buildRedisAuthStorage('redis://localhost:6379')
      const result = await secondaryStorage!.get('my-key')
      expect(mockRedisGet).toHaveBeenCalledWith('my-key')
      expect(result).toBe('stored-value')
    })

    it('returns null when the key does not exist', async () => {
      mockRedisGet.mockResolvedValue(null)
      const { secondaryStorage } = await buildRedisAuthStorage('redis://localhost:6379')
      expect(await secondaryStorage!.get('missing')).toBeNull()
    })
  })

  describe('secondaryStorage.set', () => {
    it('calls client.set when no ttl is provided', async () => {
      mockRedisSet.mockResolvedValue('OK')
      const { secondaryStorage } = await buildRedisAuthStorage('redis://localhost:6379')
      await secondaryStorage!.set('my-key', 'value')
      expect(mockRedisSet).toHaveBeenCalledWith('my-key', 'value')
      expect(mockRedisSetEx).not.toHaveBeenCalled()
    })

    it('calls client.setEx when ttl is provided', async () => {
      mockRedisSetEx.mockResolvedValue('OK')
      const { secondaryStorage } = await buildRedisAuthStorage('redis://localhost:6379')
      await secondaryStorage!.set('my-key', 'value', 300)
      expect(mockRedisSetEx).toHaveBeenCalledWith('my-key', 300, 'value')
      expect(mockRedisSet).not.toHaveBeenCalled()
    })
  })

  describe('secondaryStorage.delete', () => {
    it('calls client.del with the key', async () => {
      mockRedisDel.mockResolvedValue(1)
      const { secondaryStorage } = await buildRedisAuthStorage('redis://localhost:6379')
      await secondaryStorage!.delete('my-key')
      expect(mockRedisDel).toHaveBeenCalledWith('my-key')
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
  const redisConfig: LimitsConfig = { backend: 'redis' }

  describe('memory backend', () => {
    it('returns memory auth storage', async () => {
      const result = await buildAuthLimitsConfig(memoryConfig, {})
      expect(result.rateLimit?.enabled).toBe(true)
      expect(result.secondaryStorage).toBeUndefined()
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
      expect(result.rateLimit?.storage).toBe('secondary-storage')
      expect(result.secondaryStorage).toBeDefined()
    })

    it('close() calls the redis client quit()', async () => {
      const result = await buildAuthLimitsConfig(redisConfig, { REDIS_URL: 'redis://localhost:6379' })
      await result.close()
      expect(mockRedisQuit).toHaveBeenCalledOnce()
    })
  })
})