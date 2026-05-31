import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('better-auth', () => ({
  betterAuth: vi.fn((opts: unknown) => ({ __opts: opts, handler: vi.fn() })),
}))

vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: vi.fn((client: unknown, opts: unknown) => ({ __client: client, __opts: opts })),
}))

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => vi.fn()),
}))

vi.mock('better-auth/plugins', () => ({
  admin: vi.fn(() => ({ id: 'admin' })),
}))

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { toNodeHandler } from 'better-auth/node'
import { admin } from 'better-auth/plugins'
import { createAuth } from '../src/auth/setup.js'
import type { AuthSetupOptions } from '../src/auth/types.js'

// Stub mountAuth inline — not testing it here
function mountAuth(app: unknown, auth: unknown) { void app; void auth }

const mockPrisma = { $disconnect: vi.fn() }

const baseOptions: AuthSetupOptions = {
  secret: 'a'.repeat(32),
  trustedOrigins: ['http://localhost:3000'],
  provider: 'postgresql',
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

  it('passes the prisma adapter with the postgresql provider', () => {
    createAuth(baseOptions)
    expect(prismaAdapter).toHaveBeenCalledWith(mockPrisma, { provider: 'postgresql' })
  })

  it('passes the prisma adapter with the sqlite provider', () => {
    createAuth({ ...baseOptions, provider: 'sqlite' })
    expect(prismaAdapter).toHaveBeenCalledWith(mockPrisma, { provider: 'sqlite' })
  })

  it('enables email/password auth', () => {
    createAuth(baseOptions)
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({ emailAndPassword: { enabled: true } }),
    )
  })

  it('always enables the admin plugin', () => {
    createAuth(baseOptions)
    expect(admin).toHaveBeenCalledOnce()
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(Array.isArray(call['plugins'])).toBe(true)
    expect((call['plugins'] as Array<{ id: string }>).some((p) => p.id === 'admin')).toBe(true)
  })

  it('does not include socialProviders when none are configured', () => {
    createAuth(baseOptions)
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toBeUndefined()
  })

  it('includes github when github credentials are provided', () => {
    createAuth({ ...baseOptions, providers: { github: { clientId: 'gid', clientSecret: 'gsec' } } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toEqual({ github: { clientId: 'gid', clientSecret: 'gsec' } })
  })

  it('includes google when google credentials are provided', () => {
    createAuth({ ...baseOptions, providers: { google: { clientId: 'gid', clientSecret: 'gsec' } } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['socialProviders']).toEqual({ google: { clientId: 'gid', clientSecret: 'gsec' } })
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