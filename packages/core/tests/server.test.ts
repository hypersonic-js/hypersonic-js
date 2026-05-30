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
}

const env: Env = {
  DATABASE_URL: 'postgresql://localhost:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
}

describe('createApp', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(async () => { await disconnectPrismaClient() })

  it('returns an object with express, auth, start, and stop', async () => {
    const app = await createApp({ config, env, prisma: mockPrisma })
    expect(app).toHaveProperty('express')
    expect(app).toHaveProperty('auth')
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
    // The returned auth should be the same object betterAuth() produced
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

    // A stale version triggers 409 only if 'v42' was actually forwarded
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

    // Version "1" matches the middleware default — no mismatch, no 409
    const res = await request(app.express)
      .get('/ping')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', '1')

    expect(res.status).toBe(200)
    expect(res.body.version).toBe('1')
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
      listen: vi.fn((_port: number, _host: string, cb: () => void) => {
        setImmediate(cb)
        return mockServer
      }),
    }
    const { start, stop } = createLifecycle(mockApp as unknown as Application, config)
    await start()
    await expect(stop()).rejects.toThrow('close failed')
  })
})