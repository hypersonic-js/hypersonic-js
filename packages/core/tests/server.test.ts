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

vi.mock('@hypersonic-js/limits', () => ({
  buildAuthLimitsConfig: vi.fn().mockResolvedValue({
    rateLimit: { enabled: true, storage: 'secondary-storage' },
    secondaryStorage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  }),
}))

import { createApp } from '../src/server/app.js'
import { createLifecycle } from '../src/server/lifecycle.js'
import { disconnectPrismaClient } from '../src/database/client.js'
import type { HypersonicConfig } from '../src/config/types.js'
import type { Env } from '../src/config/env.js'
import type { Application } from 'express'

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

  // ── Security headers (helmet) ──────────────────────────────────────────────

  describe('security headers (helmet)', () => {
    it('sets X-Frame-Options to guard against clickjacking', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      app.express.get('/h', (_req, res) => res.json({ ok: true }))
      const res = await request(app.express).get('/h')
      expect(res.headers['x-frame-options']).toBeDefined()
    })

    it('sets X-Content-Type-Options: nosniff', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      app.express.get('/h', (_req, res) => res.json({ ok: true }))
      const res = await request(app.express).get('/h')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('sets Referrer-Policy to same-origin', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      app.express.get('/h', (_req, res) => res.json({ ok: true }))
      const res = await request(app.express).get('/h')
      expect(res.headers['referrer-policy']).toBe('same-origin')
    })

    it('removes X-Powered-By to avoid fingerprinting the server', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      app.express.get('/h', (_req, res) => res.json({ ok: true }))
      const res = await request(app.express).get('/h')
      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('does not set Content-Security-Policy (intentionally omitted for beta)', async () => {
      const app = await createApp({ config, env, prisma: mockPrisma })
      app.express.get('/h', (_req, res) => res.json({ ok: true }))
      const res = await request(app.express).get('/h')
      expect(res.headers['content-security-policy']).toBeUndefined()
    })
  })

  // ── limits integration ─────────────────────────────────────────────────────

  describe('limits integration', () => {
    it('does not call buildAuthLimitsConfig when config.limits is not set', async () => {
      const { buildAuthLimitsConfig } = await import('@hypersonic-js/limits')
      vi.clearAllMocks()
      await createApp({ config, env, prisma: mockPrisma })
      expect(buildAuthLimitsConfig).not.toHaveBeenCalled()
    })

    it('calls buildAuthLimitsConfig when config.limits is set', async () => {
      const { buildAuthLimitsConfig } = await import('@hypersonic-js/limits')
      vi.clearAllMocks()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma })
      expect(buildAuthLimitsConfig).toHaveBeenCalledWith({ backend: 'memory' }, env, mockPrisma)
    })

    it('skips limits wiring when rateLimit.enabled is false', async () => {
      const { buildAuthLimitsConfig } = await import('@hypersonic-js/limits')
      vi.clearAllMocks()
      const configWithLimitsDisabled: HypersonicConfig = {
        ...config,
        limits: { backend: 'redis' },
        auth: { ...config.auth, rateLimit: { enabled: false } },
      }
      await createApp({ config: configWithLimitsDisabled, env, prisma: mockPrisma })
      expect(buildAuthLimitsConfig).not.toHaveBeenCalled()
    })

    it('wires the secondaryStorage returned by buildAuthLimitsConfig into betterAuth', async () => {
      const { betterAuth } = await import('better-auth')
      vi.clearAllMocks()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'redis' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma })
      const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
      expect(call['secondaryStorage']).toBeDefined()
    })

    it('wires the rateLimit config returned by buildAuthLimitsConfig into betterAuth', async () => {
      const { betterAuth } = await import('better-auth')
      vi.clearAllMocks()
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await createApp({ config: configWithLimits, env, prisma: mockPrisma })
      const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
      expect((call['rateLimit'] as { enabled: boolean }).enabled).toBe(true)
    })

    it('throws a descriptive error when @hypersonic-js/limits is not installed', async () => {
      // A factory that throws is wrapped by Vitest into "[vitest] There was an
      // error when mocking a module" whose message does not match the isNotFound
      // check in resolveLimitsAuthConfig. Instead, return a Proxy that only throws
      // when buildAuthLimitsConfig is accessed — that throw lands inside the source
      // try block (import + property access both live there), is caught, recognised
      // as ERR_MODULE_NOT_FOUND, and re-thrown as the user-friendly error.
      vi.doMock('@hypersonic-js/limits', () =>
        new Proxy({} as Record<string, unknown>, {
          get(_target, prop) {
            if (prop === 'buildAuthLimitsConfig') {
              throw Object.assign(
                new Error("Cannot find module '@hypersonic-js/limits'"),
                { code: 'ERR_MODULE_NOT_FOUND' },
              )
            }
            return undefined
          },
        }),
      )
      const configWithLimits: HypersonicConfig = { ...config, limits: { backend: 'memory' } }
      await expect(
        createApp({ config: configWithLimits, env, prisma: mockPrisma }),
      ).rejects.toThrow('@hypersonic-js/limits is not installed')
      vi.doUnmock('@hypersonic-js/limits')
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
    // listen must call its callback so start() resolves
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
})