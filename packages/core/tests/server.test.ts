import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({ handler: vi.fn() })),
}))
vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn(() => ({})),
}))
vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => vi.fn()),
}))
vi.mock('../src/auth/middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/middleware.js')>()
  return {
    ...actual,
    mountAuth: vi.fn(),
  }
})
vi.mock('../src/inertia/vite.js', () => ({
  createViteSetup: vi.fn(async () => ({
    middleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    assetTags: () => '',
  })),
}))

const mockLogger = {
  level: 'error',
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
}

vi.mock('pino', () => ({
  default: vi.fn(() => mockLogger),
}))

// Named export to match `import { pinoHttp } from 'pino-http'` in app.ts
vi.mock('pino-http', () => ({
  pinoHttp: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

import { createApp } from '../src/server/app.js'
import { createLifecycle } from '../src/server/lifecycle.js'
import { disconnectPrismaClient, setPrismaClient } from '../src/database/client.js'
import { mountAuth } from '../src/auth/middleware.js'
import type { HypersonicConfig } from '../src/config/types.js'
import type { Env } from '../src/config/env.js'
import type { Application } from 'express'
import type { CreateAppOptions } from '../src/server/types.js'

const mockPrisma = { $disconnect: vi.fn() }

const config: HypersonicConfig = {
  server: { port: 0, host: '127.0.0.1' },
  auth: { trustedOrigins: ['http://localhost:3000'] },
  inertia: { ssr: false },
  database: { provider: 'postgresql' },
}

const env: Env = {
  DATABASE_URL: 'postgresql://localhost:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
}

/**
 * Builds a fresh limitsPlugin mock for a single test — DI replacement for
 * the old vi.mock('@hypersonic-js/limits', ...) module mock. Returns both
 * the plugin function (pass as CreateAppOptions.limitsPlugin) and the close
 * mock, so tests don't need to reach into plugin.mock.results to assert on it.
 */
function makeLimitsPlugin(): {
  plugin: NonNullable<CreateAppOptions['limitsPlugin']>
  close: ReturnType<typeof vi.fn>
} {
  const close = vi.fn().mockResolvedValue(undefined)
  const plugin = vi.fn().mockResolvedValue({
    rateLimit: { enabled: true, storage: 'secondary-storage' as const },
    secondaryStorage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    close,
  })
  return { plugin, close }
}

describe('createApp', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(async () => { await disconnectPrismaClient() })

  it('returns an object with express, auth, logger, start, and stop', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })
    expect(app).toHaveProperty('express')
    expect(app).toHaveProperty('auth')
    expect(app).toHaveProperty('logger')
    expect(app).toHaveProperty('start')
    expect(app).toHaveProperty('stop')
  })

  it('returns an Express application', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })
    expect(typeof app.express).toBe('function')
  })

  it('returns the auth instance created internally', async () => {
    const { betterAuth } = await import('better-auth')
    const app = await createApp({ config, env, prisma: mockPrisma })
    expect(app.auth).toBe(vi.mocked(betterAuth).mock.results[0]?.value)
  })

  it('wires GitHub provider when configured', async () => {
    const { betterAuth } = await import('better-auth')
    const configWithGH: HypersonicConfig = {
      ...config,
      auth: { ...config.auth, providers: { github: true } },
    }
    const envWithGH: Env = { ...env, GITHUB_CLIENT_ID: 'gid', GITHUB_CLIENT_SECRET: 'gsec' }
    await createApp({ config: configWithGH, env: envWithGH, prisma: mockPrisma })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toHaveProperty('github')
  })

  it('wires Google provider when configured', async () => {
    const { betterAuth } = await import('better-auth')
    const configWithG: HypersonicConfig = {
      ...config,
      auth: { ...config.auth, providers: { google: true } },
    }
    const envWithG: Env = { ...env, GOOGLE_CLIENT_ID: 'goid', GOOGLE_CLIENT_SECRET: 'gosec' }
    await createApp({ config: configWithG, env: envWithG, prisma: mockPrisma })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toHaveProperty('google')
  })

  it('does not include socialProviders when no providers are configured', async () => {
    const { betterAuth } = await import('better-auth')
    await createApp({ config, env, prisma: mockPrisma })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toBeUndefined()
  })

  it('forwards version from config to the Inertia middleware', async () => {
    const configWithVersion: HypersonicConfig = {
      ...config,
      inertia: { ssr: false, version: 'v42' },
    }
    const app = await createApp({ config: configWithVersion, env, prisma: mockPrisma })

    app.express.get('/ping', (req, res) => {
      res.inertia!('Ping', {})
    })

    const res = await request(app.express)
      .get('/ping')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'stale')

    expect(res.status).toBe(409)
    expect(res.headers['x-inertia-location']).toBe('/ping')
  })

  it('uses default version "1" when config.inertia.version is omitted', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })

    app.express.get('/ping', (req, res) => {
      res.inertia!('Ping', {})
    })

    const res = await request(app.express)
      .get('/ping')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', '1')

    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1')
  })

  // ── Logger ────────────────────────────────────────────────────────────────

  describe('logger', () => {
    it('creates a pino logger with error level when logging is not configured', async () => {
      const pino = (await import('pino')).default
      await createApp({ config, env, prisma: mockPrisma })
      expect(pino).toHaveBeenCalledWith({ level: 'error' })
    })

    it('creates a pino logger with the configured level', async () => {
      const pino = (await import('pino')).default
      const configWithLogging: HypersonicConfig = { ...config, logging: { level: 'debug' } }
      await createApp({ config: configWithLogging, env, prisma: mockPrisma })
      expect(pino).toHaveBeenCalledWith({ level: 'debug' })
    })

    it('returns the pino logger on app.logger', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      expect(app.logger).toBe(mockLogger)
    })

    it('mounts pino-http with the created logger', async () => {
      const { pinoHttp } = await import('pino-http')
      await createApp({ config, env, prisma: mockPrisma })
      expect(pinoHttp).toHaveBeenCalledWith({ logger: mockLogger })
    })

    it('supports all valid log levels from config', async () => {
      const pino = (await import('pino')).default
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const
      for (const level of levels) {
        vi.mocked(pino).mockClear()
        await createApp({ config: { ...config, logging: { level } }, env, prisma: mockPrisma })
        expect(pino).toHaveBeenCalledWith({ level })
      }
    })
  })

  // ── limits integration (dependency injection) ──────────────────────────────

  describe('limits integration', () => {
    it('does not call limitsPlugin when config.limits is not set', async () => {
      const { plugin } = makeLimitsPlugin()
      await createApp({ config, env, prisma: mockPrisma, limitsPlugin: plugin })
      expect(plugin).not.toHaveBeenCalled()
    })

    it('calls limitsPlugin when config.limits is set', async () => {
      const { plugin } = makeLimitsPlugin()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin })
      expect(plugin).toHaveBeenCalledWith({ backend: 'memory' }, env, mockPrisma)
    })

    it('skips limits wiring when rateLimit.enabled is false', async () => {
      const { plugin } = makeLimitsPlugin()
      const configWithLimitsDisabled: HypersonicConfig = {
        ...config,
        limits: { backend: 'redis' },
        auth: { ...config.auth, rateLimit: { enabled: false } },
      }
      await createApp({ config: configWithLimitsDisabled, env, prisma: mockPrisma, limitsPlugin: plugin })
      expect(plugin).not.toHaveBeenCalled()
    })

    it('wires the secondaryStorage returned by limitsPlugin into betterAuth', async () => {
      const { betterAuth } = await import('better-auth')
      vi.clearAllMocks()
      const { plugin } = makeLimitsPlugin()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'redis' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin })
      const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
      expect(call['secondaryStorage']).toBeDefined()
    })

    it('wires the rateLimit config returned by limitsPlugin into betterAuth', async () => {
      const { betterAuth } = await import('better-auth')
      vi.clearAllMocks()
      const { plugin } = makeLimitsPlugin()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin })
      const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
      expect((call['rateLimit'] as { enabled: boolean }).enabled).toBe(true)
    })

    it('throws a descriptive error when config.limits is set but limitsPlugin is not provided', async () => {
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await expect(
        createApp({ config: configWithLimits, env, prisma: mockPrisma }),
      ).rejects.toThrow('no limitsPlugin was passed to createApp')
    })

    it('does not throw when config.limits is set but rateLimit.enabled is false, even without limitsPlugin', async () => {
      const configWithLimitsDisabled: HypersonicConfig = {
        ...config,
        limits: { backend: 'redis' },
        auth: { ...config.auth, rateLimit: { enabled: false } },
      }
      await expect(
        createApp({ config: configWithLimitsDisabled, env, prisma: mockPrisma }),
      ).resolves.toBeDefined()
    })

    // ── close() lifecycle ───────────────────────────────────────────────────

    it('stop() calls the close() function returned by limitsPlugin', async () => {
      const { plugin, close } = makeLimitsPlugin()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'redis' } }
      const app = await createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin })
      await app.stop()
      expect(close).toHaveBeenCalledOnce()
    })

    it('stop() resolves without a limitsPlugin when config.limits is not set', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      await expect(app.stop()).resolves.toBeUndefined()
    })
  })

  // ── resource cleanup on setup failure ───────────────────────────────────────
  // Covers the leak where closeLimitsAuth (e.g. a Redis connection) was
  // opened but a later setup step (createAuth/mountAuth/createInertiaMiddleware)
  // throws before the lifecycle — and therefore app.stop() — exists to
  // release it. mountAuth is mocked module-wide (see vi.mock above) so any
  // test here can force it to throw without touching real Express internals.

  describe('resource cleanup on setup failure', () => {
    it('closes the limits auth connection if a later setup step throws', async () => {
      const { plugin, close } = makeLimitsPlugin()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'redis' } }
      vi.mocked(mountAuth).mockImplementationOnce(() => {
        throw new Error('mount failed')
      })

      await expect(
        createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin }),
      ).rejects.toThrow('mount failed')

      expect(close).toHaveBeenCalledOnce()
    })

    it('propagates the original setup error even when closeLimitsAuth itself rejects', async () => {
      const close = vi.fn().mockRejectedValue(new Error('close failed'))
      const plugin = vi.fn().mockResolvedValue({
        rateLimit: { enabled: true, storage: 'secondary-storage' as const },
        secondaryStorage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
        close,
      })
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'redis' } }
      vi.mocked(mountAuth).mockImplementationOnce(() => {
        throw new Error('mount failed')
      })

      await expect(
        createApp({ config: configWithLimits, env, prisma: mockPrisma, limitsPlugin: plugin }),
      ).rejects.toThrow('mount failed')

      expect(close).toHaveBeenCalledOnce()
    })

    it('does not attempt to close anything when setup fails and no limits plugin was configured', async () => {
      vi.mocked(mountAuth).mockImplementationOnce(() => {
        throw new Error('mount failed')
      })

      await expect(
        createApp({ config, env, prisma: mockPrisma }),
      ).rejects.toThrow('mount failed')
    })
  })
})

describe('lifecycle — via createLifecycle', () => {
  afterEach(async () => { await disconnectPrismaClient() })

  it('start() resolves when the server binds successfully', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })
    await app.start()
    await app.stop()
  })

  it('stop() disconnects the prisma client', async () => {
    const prisma = { $disconnect: vi.fn() }
    const app = await createApp({ config, env, prisma })
    await app.start()
    await app.stop()
    expect(prisma.$disconnect).toHaveBeenCalledOnce()
  })

  it('stop() resolves even if start() was never called', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })
    await expect(app.stop()).resolves.toBeUndefined()
  })

  it('start() rejects when the server emits an error event', async () => {
    const serverError = new Error('EADDRINUSE')
    const mockServer = {
      on: vi.fn().mockImplementation((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setImmediate(() => cb(serverError))
        return mockServer
      }),
      close: vi.fn((cb: () => void) => cb()),
    }
    const mockApp = { listen: vi.fn(() => mockServer) }
    const { start } = createLifecycle(mockApp as unknown as Application, config)
    await expect(start()).rejects.toThrow('EADDRINUSE')
  })

  it('stop() rejects when server.close() returns an error', async () => {
    const closeError = new Error('close failed')
    const mockServer = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn((cb: (err?: Error) => void) => cb(closeError)),
    }
    const mockApp = {
      listen: vi.fn((_port: unknown, _host: unknown, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config)
    await start()
    await expect(stop()).rejects.toThrow('close failed')
  })

  it('stop() awaits the onStop callback when provided', async () => {
    const onStop = vi.fn().mockResolvedValue(undefined)
    const mockServer = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn((cb: () => void) => cb()),
    }
    const mockApp = {
      listen: vi.fn((_port: unknown, _host: unknown, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config, onStop)
    await start()
    await stop()
    expect(onStop).toHaveBeenCalledOnce()
  })

  // ── guaranteed close() even when a prior step rejects ───────────────────────

  it('still closes the server if disconnectPrismaClient() rejects', async () => {
    const disconnectError = new Error('disconnect failed')
    setPrismaClient({ $disconnect: vi.fn().mockRejectedValue(disconnectError) })

    const mockServer = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn((cb: () => void) => cb()),
    }
    const mockApp = {
      listen: vi.fn((_port: unknown, _host: unknown, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config)
    await start()

    await expect(stop()).rejects.toThrow('disconnect failed')
    expect(mockServer.close).toHaveBeenCalledOnce()

    // The rejecting $disconnect leaves the singleton registered (it only
    // clears on success) — reset it so the shared afterEach's
    // disconnectPrismaClient() call can complete cleanly.
    setPrismaClient({ $disconnect: vi.fn().mockResolvedValue(undefined) })
  })

  it('still closes the server if onStop() rejects', async () => {
    const onStop = vi.fn().mockRejectedValue(new Error('onStop failed'))
    const mockServer = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn((cb: () => void) => cb()),
    }
    const mockApp = {
      listen: vi.fn((_port: unknown, _host: unknown, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config, onStop)
    await start()

    await expect(stop()).rejects.toThrow('onStop failed')
    expect(mockServer.close).toHaveBeenCalledOnce()
  })

  it('surfaces the server close() error when close() fails after onStop() also rejected', async () => {
    const onStop = vi.fn().mockRejectedValue(new Error('onStop failed'))
    const closeError = new Error('close failed')
    const mockServer = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn((cb: (err?: Error) => void) => cb(closeError)),
    }
    const mockApp = {
      listen: vi.fn((_port: unknown, _host: unknown, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config, onStop)
    await start()

    await expect(stop()).rejects.toThrow('close failed')
  })
})