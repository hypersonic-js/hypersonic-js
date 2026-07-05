import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendCommand = vi.fn()
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockSetEx = vi.fn()
const mockExists = vi.fn()
const mockDel = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockOn = vi.fn().mockReturnThis()
const mockQuit = vi.fn().mockResolvedValue('OK')

const mockClient = {
  sendCommand: mockSendCommand,
  get: mockGet,
  set: mockSet,
  setEx: mockSetEx,
  exists: mockExists,
  del: mockDel,
  connect: mockConnect,
  on: mockOn,
  quit: mockQuit,
}

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockClient),
}))

// MockRedisStoreConstructor is directly read inside the factory, so it must be
// declared with vi.hoisted() to avoid the temporal dead zone after hoisting.
const { mockRedisStore, MockRedisStoreConstructor } = vi.hoisted(() => {
  const mockRedisStore = { __type: 'RedisStore' }
  const MockRedisStoreConstructor = vi.fn(function () { return mockRedisStore })
  return { mockRedisStore, MockRedisStoreConstructor }
})

vi.mock('rate-limit-redis', () => ({
  RedisStore: MockRedisStoreConstructor,
}))

import { createRedisStore, wrapRedisStore, RedisBlockStore, connectRedisClient } from '../../src/stores/redis-store.js'
import { createClient } from 'redis'

// ── connectRedisClient ────────────────────────────────────────────────────────
// The shared helper extracted so createRedisStore (below) and
// buildRedisAuthStorage (packages/limits/src/auth-storage.ts) don't each
// re-implement the connect/error-handler/connect() sequence.

describe('connectRedisClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnect.mockResolvedValue(undefined)
    mockOn.mockReturnThis()
  })

  it('creates a redis client with the provided URL', async () => {
    await connectRedisClient('redis://localhost:6379', 'Limits')
    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' })
  })

  it('registers an error handler on the client', async () => {
    await connectRedisClient('redis://localhost:6379', 'Limits')
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('connects the client before returning', async () => {
    await connectRedisClient('redis://localhost:6379', 'Limits')
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('returns the connected client', async () => {
    const client = await connectRedisClient('redis://localhost:6379', 'Limits')
    expect(client).toBe(mockClient)
  })

  it('includes the given label in the error log message', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await connectRedisClient('redis://localhost:6379', 'Auth')
    const errorHandler = mockOn.mock.calls.find(([event]) => event === 'error')![1] as (
      err: unknown,
    ) => void
    errorHandler(new Error('boom'))
    expect(consoleErrorSpy).toHaveBeenCalledWith('Hypersonic Auth Redis Client Error:', expect.any(Error))
    consoleErrorSpy.mockRestore()
  })

  it('error handler does not throw when invoked', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await connectRedisClient('redis://localhost:6379', 'Limits')
    const errorHandler = mockOn.mock.calls.find(([event]) => event === 'error')![1] as (
      err: unknown,
    ) => void
    expect(() => errorHandler(new Error('connection refused'))).not.toThrow()
    consoleErrorSpy.mockRestore()
  })
})

// ── wrapRedisStore ────────────────────────────────────────────────────────────
// The only place a RedisStore actually gets constructed — both
// createRedisStore (below) and createLimiter()'s redis backend
// (../middleware.js) go through this rather than duplicating the
// construction call.

describe('wrapRedisStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constructs a RedisStore with the given prefix', () => {
    wrapRedisStore(mockClient, 'rl:login:')
    expect(MockRedisStoreConstructor).toHaveBeenCalledWith({
      prefix: 'rl:login:',
      sendCommand: expect.any(Function),
    })
  })

  it('returns the constructed RedisStore', () => {
    const store = wrapRedisStore(mockClient, 'rl:login:')
    expect(store).toBe(mockRedisStore)
  })

  it('the sendCommand function delegates to the given client\'s sendCommand', async () => {
    wrapRedisStore(mockClient, 'rl:login:')
    const { sendCommand } = MockRedisStoreConstructor.mock.calls[0]![0] as {
      sendCommand: (...args: string[]) => unknown
    }
    mockSendCommand.mockResolvedValue('OK')
    await sendCommand('GET', 'key')
    expect(mockSendCommand).toHaveBeenCalledWith(['GET', 'key'])
  })

  it('different calls with different prefixes produce independently-configured stores', () => {
    // Regression guard: two routes sharing one Redis connection must get
    // distinctly-prefixed stores, or they'd collide on the same keys —
    // see createLimiter()'s redis backend in ../middleware.js.
    wrapRedisStore(mockClient, 'rl:login:')
    wrapRedisStore(mockClient, 'rl:signup:')
    expect(MockRedisStoreConstructor).toHaveBeenNthCalledWith(1, {
      prefix: 'rl:login:',
      sendCommand: expect.any(Function),
    })
    expect(MockRedisStoreConstructor).toHaveBeenNthCalledWith(2, {
      prefix: 'rl:signup:',
      sendCommand: expect.any(Function),
    })
  })
})

// ── createRedisStore ──────────────────────────────────────────────────────────

describe('createRedisStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnect.mockResolvedValue(undefined)
    mockOn.mockReturnThis()
  })

  it('creates a redis client with the provided URL', async () => {
    await createRedisStore('redis://localhost:6379', 'rl:')
    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' })
  })

  it('registers an error handler on the client', async () => {
    await createRedisStore('redis://localhost:6379', 'rl:')
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('connects the client before returning', async () => {
    await createRedisStore('redis://localhost:6379', 'rl:')
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('returns a RedisStore constructed with a sendCommand function and the given prefix', async () => {
    await createRedisStore('redis://localhost:6379', 'rl:')
    expect(MockRedisStoreConstructor).toHaveBeenCalledWith({
      prefix: 'rl:',
      sendCommand: expect.any(Function),
    })
  })

  it('the sendCommand function delegates to client.sendCommand', async () => {
    await createRedisStore('redis://localhost:6379', 'rl:')
    const { sendCommand } = MockRedisStoreConstructor.mock.calls[0]![0] as {
      sendCommand: (...args: string[]) => unknown
    }
    mockSendCommand.mockResolvedValue('OK')
    await sendCommand('SET', 'key', 'value')
    expect(mockSendCommand).toHaveBeenCalledWith(['SET', 'key', 'value'])
  })

  it('returns the constructed RedisStore as store', async () => {
    const { store } = await createRedisStore('redis://localhost:6379', 'rl:')
    expect(store).toBe(mockRedisStore)
  })

  it('returns the redis client as redisClient', async () => {
    const { redisClient } = await createRedisStore('redis://localhost:6379', 'rl:')
    expect(redisClient).toBe(mockClient)
  })

  it('error handler does not throw when called', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await createRedisStore('redis://localhost:6379', 'rl:')
    const errorHandler = mockOn.mock.calls.find(
      ([event]) => event === 'error',
    )![1] as (err: unknown) => void
    expect(() => errorHandler(new Error('connection refused'))).not.toThrow()
    consoleErrorSpy.mockRestore()
  })
})

// ── RedisBlockStore ───────────────────────────────────────────────────────────

describe('RedisBlockStore', () => {
  let blockStore: RedisBlockStore

  beforeEach(() => {
    vi.clearAllMocks()
    blockStore = new RedisBlockStore(mockClient)
  })

  describe('isBlocked', () => {
    it('returns false when the key does not exist in Redis', async () => {
      mockExists.mockResolvedValue(0)
      expect(await blockStore.isBlocked('192.168.1.1')).toBe(false)
    })

    it('returns true when the key exists in Redis', async () => {
      mockExists.mockResolvedValue(1)
      expect(await blockStore.isBlocked('10.0.0.1')).toBe(true)
    })

    it('checks the correct prefixed key', async () => {
      mockExists.mockResolvedValue(0)
      await blockStore.isBlocked('1.2.3.4')
      expect(mockExists).toHaveBeenCalledWith('rl:block:1.2.3.4')
    })
  })

  describe('block', () => {
    it('calls set with PX option for millisecond expiry', async () => {
      mockSet.mockResolvedValue('OK')
      await blockStore.block('1.2.3.4', 300_000)
      expect(mockSet).toHaveBeenCalledWith('rl:block:1.2.3.4', '1', { PX: 300_000 })
    })

    it('uses the correct prefixed key when blocking', async () => {
      mockSet.mockResolvedValue('OK')
      await blockStore.block('::1', 5000)
      expect(mockSet).toHaveBeenCalledWith('rl:block:::1', '1', { PX: 5000 })
    })

    it('forwards the exact durationMs to PX', async () => {
      mockSet.mockResolvedValue('OK')
      await blockStore.block('192.168.1.1', 12345)
      expect(mockSet).toHaveBeenCalledWith('rl:block:192.168.1.1', '1', { PX: 12345 })
    })
  })
})