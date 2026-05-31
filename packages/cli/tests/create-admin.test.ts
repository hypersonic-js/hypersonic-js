import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'

vi.mock('dotenv', () => ({ config: vi.fn() }))

// loadDeps() is never called in tests (deps always injected) but Vitest resolves
// the dynamic imports at transform time, so each package must be mockable.
vi.mock('@hypersonic-js/core', () => ({
  loadConfig: vi.fn(),
  createDatabaseAdapter: vi.fn(),
}))
vi.mock('better-auth', () => ({ betterAuth: vi.fn() }))
vi.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: vi.fn() }))
vi.mock('better-auth/plugins', () => ({ admin: vi.fn() }))
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn() }))

import {
  runCreateAdmin,
  registerCreateAdmin,
} from '../src/create-admin.js'
import type { CreateAdminDeps, CreateAdminOptions } from '../src/create-admin.js'

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeDeps(): { deps: CreateAdminDeps; createUser: ReturnType<typeof vi.fn> } {
  const createUser = vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'admin@example.com' },
  })

  const mockAuth = { api: { createUser } }
  const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }
  const mockAdapter = { _adapter: 'pg' }

  const deps: CreateAdminDeps = {
    betterAuth: vi.fn().mockReturnValue(mockAuth),
    prismaAdapter: vi.fn().mockReturnValue({}),
    adminPlugin: vi.fn().mockReturnValue({ id: 'admin' }),
    PrismaClient: vi.fn().mockImplementation(
      function () { return mockPrisma },
    ) as unknown as CreateAdminDeps['PrismaClient'],
    loadConfig: vi.fn().mockResolvedValue({
      config: { database: { provider: 'postgresql' } },
      env: {
        DATABASE_URL: 'postgresql://localhost:5432/test',
        BETTER_AUTH_SECRET: 'a'.repeat(32),
      },
    }),
    createDatabaseAdapter: vi.fn().mockResolvedValue(mockAdapter),
  }

  return { deps, createUser }
}

const validOpts: CreateAdminOptions = {
  email: 'admin@example.com',
  name: 'Admin User',
  password: 'super-secret-password',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── runCreateAdmin ────────────────────────────────────────────────────────────

describe('runCreateAdmin', () => {
  describe('config loading', () => {
    it('calls loadConfig to read the project config and env', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.loadConfig).toHaveBeenCalledOnce()
    })

    it('propagates errors thrown by loadConfig (e.g. missing env vars)', async () => {
      const { deps } = makeDeps()
      vi.mocked(deps.loadConfig).mockRejectedValue(new Error('DATABASE_URL is not set'))
      await expect(runCreateAdmin(validOpts, deps)).rejects.toThrow('DATABASE_URL is not set')
    })
  })

  describe('adapter creation', () => {
    it('calls createDatabaseAdapter with the provider from config', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.createDatabaseAdapter).toHaveBeenCalledWith('postgresql', 'postgresql://localhost:5432/test')
    })

    it('passes the adapter returned by createDatabaseAdapter to PrismaClient', async () => {
      const { deps } = makeDeps()
      const mockAdapter = { _adapter: 'pg' }
      vi.mocked(deps.createDatabaseAdapter).mockResolvedValue(mockAdapter)
      await runCreateAdmin(validOpts, deps)
      expect(deps.PrismaClient).toHaveBeenCalledWith({ adapter: mockAdapter })
    })

    it('uses the sqlite provider when config specifies sqlite', async () => {
      const { deps } = makeDeps()
      vi.mocked(deps.loadConfig).mockResolvedValue({
        config: { database: { provider: 'sqlite' } },
        env: { DATABASE_URL: 'file:./dev.db', BETTER_AUTH_SECRET: 'a'.repeat(32) },
      })
      await runCreateAdmin(validOpts, deps)
      expect(deps.createDatabaseAdapter).toHaveBeenCalledWith('sqlite', 'file:./dev.db')
    })
  })

  describe('auth wiring', () => {
    it('calls betterAuth with the secret from env', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.betterAuth).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'a'.repeat(32) }),
      )
    })

    it('calls prismaAdapter with the provider from config', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.prismaAdapter).toHaveBeenCalledWith(
        expect.anything(),
        { provider: 'postgresql' },
      )
    })

    it('passes emailAndPassword enabled to betterAuth', async () => {
      const { deps } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(deps.betterAuth).toHaveBeenCalledWith(
        expect.objectContaining({ emailAndPassword: { enabled: true } }),
      )
    })
  })

  describe('user creation', () => {
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

    it('always sets role to "admin"', async () => {
      const { deps, createUser } = makeDeps()
      await runCreateAdmin(validOpts, deps)
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({ role: 'admin' }),
      })
    })
  })

  describe('cleanup', () => {
    it('always disconnects Prisma even when createUser throws', async () => {
      const { deps } = makeDeps()
      const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(deps.PrismaClient).mockImplementation(function () { return mockPrisma })
      vi.mocked(deps.betterAuth).mockReturnValue({
        api: { createUser: vi.fn().mockRejectedValue(new Error('DB error')) },
      })
      await expect(runCreateAdmin(validOpts, deps)).rejects.toThrow('DB error')
      expect(mockPrisma.$disconnect).toHaveBeenCalledOnce()
    })

    it('disconnects Prisma on success', async () => {
      const { deps } = makeDeps()
      const mockPrisma = { $disconnect: vi.fn().mockResolvedValue(undefined) }
      vi.mocked(deps.PrismaClient).mockImplementation(function () { return mockPrisma })
      await runCreateAdmin(validOpts, deps)
      expect(mockPrisma.$disconnect).toHaveBeenCalledOnce()
    })

    it('propagates error when createDatabaseAdapter throws (no Prisma to disconnect)', async () => {
      const { deps } = makeDeps()
      vi.mocked(deps.createDatabaseAdapter).mockRejectedValue(new Error('adapter error'))
      await expect(runCreateAdmin(validOpts, deps)).rejects.toThrow('adapter error')
    })
  })
})

// ── registerCreateAdmin ───────────────────────────────────────────────────────

describe('registerCreateAdmin', () => {
  function buildProgram(mockPrompt?: ReturnType<typeof vi.fn>) {
    const program = new Command()
    program.exitOverride()
    const admin = program.command('admin')
    registerCreateAdmin(admin, mockPrompt, makeDeps().deps)
    return { program, admin }
  }

  it('registers create-admin as a subcommand of admin', () => {
    const { admin } = buildProgram()
    expect(admin.commands.find((c) => c.name() === 'create-admin')).toBeDefined()
  })

  it('create-admin has a description', () => {
    const { admin } = buildProgram()
    expect(admin.commands.find((c) => c.name() === 'create-admin')!.description()).toBeTruthy()
  })

  it('create-admin has no options (prompts interactively instead)', () => {
    const { admin } = buildProgram()
    expect(admin.commands.find((c) => c.name() === 'create-admin')!.options).toHaveLength(0)
  })

  describe('interactive prompts', () => {
    function makePrompt(answers: string[]) {
      let call = 0
      return vi.fn().mockImplementation(() => Promise.resolve(answers[call++] ?? ''))
    }

    it('prompts for email first', async () => {
      const mockPrompt = makePrompt(['e@example.com', 'Alice', 'pw'])
      const { program } = buildProgram(mockPrompt)
      await program.parseAsync(['node', 'hypersonic', 'admin', 'create-admin'])
      expect(mockPrompt).toHaveBeenNthCalledWith(1, 'Email: ')
    })

    it('prompts for name second', async () => {
      const mockPrompt = makePrompt(['e@example.com', 'Alice', 'pw'])
      const { program } = buildProgram(mockPrompt)
      await program.parseAsync(['node', 'hypersonic', 'admin', 'create-admin'])
      expect(mockPrompt).toHaveBeenNthCalledWith(2, 'Name: ')
    })

    it('prompts for password third with hidden=true', async () => {
      const mockPrompt = makePrompt(['e@example.com', 'Alice', 'pw'])
      const { program } = buildProgram(mockPrompt)
      await program.parseAsync(['node', 'hypersonic', 'admin', 'create-admin'])
      expect(mockPrompt).toHaveBeenNthCalledWith(3, 'Password: ', true)
    })

    it('prompts exactly three times', async () => {
      const mockPrompt = makePrompt(['e@example.com', 'Alice', 'pw'])
      const { program } = buildProgram(mockPrompt)
      await program.parseAsync(['node', 'hypersonic', 'admin', 'create-admin'])
      expect(mockPrompt).toHaveBeenCalledTimes(3)
    })

    it('passes prompted values to runCreateAdmin', async () => {
      const mockPrompt = makePrompt(['prompted@example.com', 'Prompted User', 'prompted-pw'])
      const { deps, createUser } = makeDeps()
      const program = new Command()
      program.exitOverride()
      const admin = program.command('admin')
      registerCreateAdmin(admin, mockPrompt, deps)
      await program.parseAsync(['node', 'hypersonic', 'admin', 'create-admin'])
      expect(createUser).toHaveBeenCalledWith({
        body: expect.objectContaining({
          email: 'prompted@example.com',
          name: 'Prompted User',
          password: 'prompted-pw',
        }),
      })
    })
  })
})