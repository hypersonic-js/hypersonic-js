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
import { admin } from 'better-auth/plugins'
import { createAuth } from '../src/auth/setup.js'
import type { AuthSetupOptions } from '../src/auth/types.js'

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

  // ── rateLimit ─────────────────────────────────────────────────────────────

  it('does not include rateLimit when the option is omitted', () => {
    createAuth(baseOptions)
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['rateLimit']).toBeUndefined()
  })

  it('forwards rateLimit: { enabled: false } to betterAuth', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: false } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['rateLimit']).toEqual({ enabled: false })
  })

  it('forwards rateLimit: { enabled: true } to betterAuth', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: true } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['rateLimit']).toEqual({ enabled: true })
  })

  it('forwards rateLimit with storage: secondary-storage when provided', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: true, storage: 'secondary-storage' } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['rateLimit']).toEqual({ enabled: true, storage: 'secondary-storage' })
  })

  it('forwards rateLimit with customStorage when provided', () => {
    const customStorage = { get: vi.fn(), set: vi.fn() }
    createAuth({ ...baseOptions, rateLimit: { enabled: true, customStorage } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    const rl = call['rateLimit'] as { customStorage: unknown }
    expect(rl.customStorage).toBe(customStorage)
  })

  // The following four tests use upstream Better Auth rateLimit fields
  // (window, max, customRules, storage: "memory"/"database") that the old
  // hand-rolled AuthRateLimitOptions type didn't declare. Written as inline
  // object literals (not variables), these previously failed to typecheck
  // via TypeScript's excess-property check even though createAuth already
  // passed them through to betterAuth() correctly at runtime — this is the
  // literal bug the type-widening fix addresses.

  it('forwards rateLimit with window and max (Better Auth upstream fields)', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: true, window: 60, max: 100 } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect(call['rateLimit']).toEqual({ enabled: true, window: 60, max: 100 })
  })

  it('forwards rateLimit with customRules (Better Auth upstream field)', () => {
    const customRules = { '/sign-in/email': { window: 10, max: 3 } }
    createAuth({ ...baseOptions, rateLimit: { enabled: true, customRules } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect((call['rateLimit'] as { customRules: unknown }).customRules).toBe(customRules)
  })

  it('accepts rateLimit storage: "database" (previously restricted to only "secondary-storage")', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: true, storage: 'database' } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect((call['rateLimit'] as { storage: string }).storage).toBe('database')
  })

  it('accepts rateLimit storage: "memory" (previously restricted to only "secondary-storage")', () => {
    createAuth({ ...baseOptions, rateLimit: { enabled: true, storage: 'memory' } })
    const call = vi.mocked(betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
    expect((call['rateLimit'] as { storage: string }).storage).toBe('memory')
  })
})