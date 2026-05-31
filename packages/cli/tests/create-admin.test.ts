import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import {
  runCreateAdmin,
  registerCreateAdmin,
} from '../src/commands/admin/create-admin.js'
import type { CreateAdminDeps, CreateAdminOptions } from '../src/commands/admin/create-admin.js'

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeDeps(): { deps: CreateAdminDeps; createUser: ReturnType<typeof vi.fn> } {
  const createUser = vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'admin@example.com' },
  })

  const mockAuth = { api: { createUser } }
  const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }

  const deps: CreateAdminDeps = {
    betterAuth: vi.fn().mockReturnValue(mockAuth),
    prismaAdapter: vi.fn().mockReturnValue({}),
    adminPlugin: vi.fn().mockReturnValue({ id: 'admin' }),
    // Must use a regular function (not arrow) so `new PrismaClient()` works
    PrismaClient: vi.fn().mockImplementation(
      function () { return mockPrisma },
    ) as unknown as CreateAdminDeps['PrismaClient'],
    detectProvider: vi.fn().mockReturnValue('postgresql'),
  }

  return { deps, createUser }
}

const validOpts: CreateAdminOptions = {
  email: 'admin@example.com',
  name: 'Admin User',
  password: 'super-secret-password',
}

// ── Environment helpers ───────────────────────────────────────────────────────

let savedEnv: NodeJS.ProcessEnv

beforeEach(() => {
  savedEnv = { ...process.env }
  process.env['DATABASE_URL'] = 'postgresql://localhost:5432/test'
  process.env['BETTER_AUTH_SECRET'] = 'a'.repeat(32)
  vi.clearAllMocks()
})

afterEach(() => {
  process.env = savedEnv
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runCreateAdmin', () => {
  describe('environment validation', () => {
    it('throws when DATABASE_URL is not set', async () => {
      delete process.env['DATABASE_URL']
      await expect(runCreateAdmin(validOpts, makeDeps().deps)).rejects.toThrow('DATABASE_URL')
    })

    it('throws when BETTER_AUTH_SECRET is not set', async () => {
      delete process.env['BETTER_AUTH_SECRET']
      await expect(runCreateAdmin(validOpts, makeDeps().deps)).rejects.toThrow('BETTER_AUTH_SECRET')
    })
  })

  describe('Better Auth wiring', () => {
    it('creates a Better Auth instance with the admin plugin', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.betterAuth).toHaveBeenCalledOnce()
      expect(deps.adminPlugin).toHaveBeenCalledOnce()
    })

    it('passes emailAndPassword enabled to betterAuth', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.betterAuth).toHaveBeenCalledWith(
        expect.objectContaining({ emailAndPassword: { enabled: true } }),
      )
    })

    it('passes the admin plugin result in the plugins array', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      const call = vi.mocked(deps.betterAuth).mock.calls[0]?.[0] as Record<string, unknown>
      expect(Array.isArray(call['plugins'])).toBe(true)
      expect((call['plugins'] as unknown[]).length).toBeGreaterThan(0)
    })

    it('uses detectProvider to resolve the database adapter provider', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.detectProvider).toHaveBeenCalledWith(process.env['DATABASE_URL'])
      expect(deps.prismaAdapter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ provider: 'postgresql' }),
      )
    })

    it('creates a PrismaClient with the DATABASE_URL', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.PrismaClient).toHaveBeenCalledWith({
        datasourceUrl: process.env['DATABASE_URL'],
      })
    })
  })

  describe('createUser call', () => {
    it('calls auth.api.createUser with role "admin"', async () => {
      const { deps, createUser } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(createUser).toHaveBeenCalledOnce()
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({ role: 'admin' }),
      })
    })

    it('passes the provided email to createUser', async () => {
      const { deps, createUser } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({ email: 'admin@example.com' }),
      })
    })

    it('passes the provided name to createUser', async () => {
      const { deps, createUser } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({ name: 'Admin User' }),
      })
    })

    it('passes the provided password to createUser', async () => {
      const { deps, createUser } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({ password: 'super-secret-password' }),
      })
    })
  })

  describe('cleanup', () => {
    it('always disconnects the Prisma client even when createUser throws', async () => {
      const { deps } = makeDeps()
      const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(deps.PrismaClient).mockImplementation(function () { return mockPrisma })
      vi.mocked(deps.betterAuth).mockReturnValue({
        api: { createUser: vi.fn().mockRejectedValue(new Error('DB error')) },
      })

      await expect(runCreateAdmin(validOpts, deps)).rejects.toThrow('DB error')
      expect(mockPrisma.$disconnect).toHaveBeenCalledOnce()
    })

    it('disconnects the Prisma client on success', async () => {
      const { deps } = makeDeps()
      const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(deps.PrismaClient).mockImplementation(function () { return mockPrisma })

      await runCreateAdmin(validOpts, deps)
      expect(mockPrisma.$disconnect).toHaveBeenCalledOnce()
    })
  })
})

describe('registerCreateAdmin', () => {
  function buildProgram() {
    const program = new Command()
    program.exitOverride()
    const admin = program.command('admin')
    registerCreateAdmin(admin)
    return { program, admin }
  }

  it('registers create-admin as a subcommand of admin', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')
    expect(sub).toBeDefined()
  })

  it('create-admin has a description', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')!
    expect(sub.description()).toBeTruthy()
  })

  it('has a required --email option', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')!
    const opt = sub.options.find((o) => o.long === '--email')
    expect(opt).toBeDefined()
    expect(opt!.mandatory).toBe(true)
  })

  it('has a required --name option', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')!
    const opt = sub.options.find((o) => o.long === '--name')
    expect(opt).toBeDefined()
    expect(opt!.mandatory).toBe(true)
  })

  it('has a required --password option', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')!
    const opt = sub.options.find((o) => o.long === '--password')
    expect(opt).toBeDefined()
    expect(opt!.mandatory).toBe(true)
  })
})