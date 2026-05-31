import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'

// Mock dotenv so the dynamic import('dotenv') inside the action doesn't fail
vi.mock('dotenv', () => ({ config: vi.fn() }))

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

// ── runCreateAdmin tests ──────────────────────────────────────────────────────

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

// ── registerCreateAdmin tests ─────────────────────────────────────────────────

describe('registerCreateAdmin', () => {
  // Build a program with a mock prompt and mock deps so the action never
  // touches stdin or a real database.
  function buildProgram(mockPrompt?: ReturnType<typeof vi.fn>) {
    const program = new Command()
    program.exitOverride()
    const admin = program.command('admin')
    registerCreateAdmin(admin, mockPrompt, makeDeps().deps)
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

  it('create-admin has no options (prompts interactively instead)', () => {
    const { admin } = buildProgram()
    const sub = admin.commands.find((c) => c.name() === 'create-admin')!
    expect(sub.options).toHaveLength(0)
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