import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock better-auth and its adapter before importing our modules
vi.mock('better-auth', () => ({
  betterAuth: vi.fn((opts: unknown) => ({ __opts: opts, handler: vi.fn() })),
}))

vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn((client: unknown, opts: unknown) => ({ __client: client, __opts: opts })),
}))

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => vi.fn()),
}))

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { toNodeHandler } from 'better-auth/node'
import { createAuth } from '../src/auth/setup.js'
import { mountAuth } from '../src/auth/middleware.js'
import type { AuthSetupOptions } from '../src/auth/types.js'

const mockPrisma = { $disconnect: vi.fn() }

const baseOptions: AuthSetupOptions = {
  secret: 'a'.repeat(32),
  trustedOrigins: ['http://localhost:3000'],
  databaseUrl: 'postgresql://localhost:5432/db',
  prisma: mockPrisma,
}

describe('createAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls betterAuth with secret and trustedOrigins', () => {
    createAuth(baseOptions)
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: baseOptions.secret,
        trustedOrigins: baseOptions.trustedOrigins,
      }),
    )
  })

  it('passes the prisma adapter with detected provider', () => {
    createAuth(baseOptions)
    expect(prismaAdapter).toHaveBeenCalledWith(mockPrisma, { provider: 'postgresql' })
  })

  it('detects mysql provider from database URL', () => {
    createAuth({ ...baseOptions, databaseUrl: 'mysql://localhost/db' })
    expect(prismaAdapter).toHaveBeenCalledWith(mockPrisma, { provider: 'mysql' })
  })

  it('enables email/password auth', () => {
    createAuth(baseOptions)
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({ emailAndPassword: { enabled: true } }),
    )
  })

  it('does not include socialProviders when none are configured', () => {
    createAuth(baseOptions)
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toBeUndefined()
  })

  it('includes github when github credentials are provided', () => {
    createAuth({
      ...baseOptions,
      providers: {
        github: { clientId: 'gid', clientSecret: 'gsec' },
      },
    })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toEqual({
      github: { clientId: 'gid', clientSecret: 'gsec' },
    })
  })

  it('includes google when google credentials are provided', () => {
    createAuth({
      ...baseOptions,
      providers: {
        google: { clientId: 'gid', clientSecret: 'gsec' },
      },
    })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toEqual({
      google: { clientId: 'gid', clientSecret: 'gsec' },
    })
  })

  it('includes both providers when both are supplied', () => {
    createAuth({
      ...baseOptions,
      providers: {
        github: { clientId: 'ghid', clientSecret: 'ghsec' },
        google: { clientId: 'goid', clientSecret: 'gosec' },
      },
    })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toHaveProperty('github')
    expect(call['socialProviders']).toHaveProperty('google')
  })
})

describe('mountAuth', () => {
  it('registers a handler on /api/auth/*splat', () => {
    const mockApp = { all: vi.fn() } as unknown as Parameters<typeof mountAuth>[0]
    const mockAuth = createAuth(baseOptions)
    mountAuth(mockApp, mockAuth)
    expect(mockApp.all).toHaveBeenCalledWith('/api/auth/*splat', expect.any(Function))
  })

  it('uses toNodeHandler to convert the auth instance', () => {
    const mockApp = { all: vi.fn() } as unknown as Parameters<typeof mountAuth>[0]
    mountAuth(mockApp, createAuth(baseOptions))
    expect(toNodeHandler).toHaveBeenCalled()
  })
})
