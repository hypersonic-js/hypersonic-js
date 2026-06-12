import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'

// ── Mock the three sub-registrars so this suite stays focused on the
//    index orchestration, not on scaffold / create-admin / generate-meta
//    internals (those have their own dedicated test files). ──────────────────

vi.mock('../../../src/commands/admin/scaffold.js', () => ({
  registerAdminScaffold: vi.fn(),
}))
vi.mock('../../../src/commands/admin/create-admin.js', () => ({
  registerCreateAdmin: vi.fn(),
}))
vi.mock('../../../src/commands/admin/generate-meta.js', () => ({
  registerGenerateMeta: vi.fn(),
}))

// Static imports must come after vi.mock() hoisting.
import { registerAdminCommands } from '../../../src/commands/admin/index.js'
import { registerAdminScaffold } from '../../../src/commands/admin/scaffold.js'
import { registerCreateAdmin } from '../../../src/commands/admin/create-admin.js'
import { registerGenerateMeta } from '../../../src/commands/admin/generate-meta.js'

// ── Helper ────────────────────────────────────────────────────────────────────

function buildProgram(): Command {
  const program = new Command()
  program.exitOverride()
  registerAdminCommands(program)
  return program
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerAdminCommands', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is exported as a function', () => {
    expect(typeof registerAdminCommands).toBe('function')
  })

  it('registers an "admin" command on the program', () => {
    const program = buildProgram()
    expect(program.commands.find((c) => c.name() === 'admin')).toBeDefined()
  })

  it('admin command has description "Admin dashboard commands"', () => {
    const program = buildProgram()
    const admin = program.commands.find((c) => c.name() === 'admin')!
    expect(admin.description()).toBe('Admin dashboard commands')
  })

  it('calls registerAdminScaffold with the admin command', () => {
    const program = buildProgram()
    const admin = program.commands.find((c) => c.name() === 'admin')!
    expect(vi.mocked(registerAdminScaffold)).toHaveBeenCalledWith(admin)
  })

  it('calls registerCreateAdmin with the admin command', () => {
    const program = buildProgram()
    const admin = program.commands.find((c) => c.name() === 'admin')!
    expect(vi.mocked(registerCreateAdmin)).toHaveBeenCalledWith(admin)
  })

  it('calls registerGenerateMeta with the admin command', () => {
    const program = buildProgram()
    const admin = program.commands.find((c) => c.name() === 'admin')!
    expect(vi.mocked(registerGenerateMeta)).toHaveBeenCalledWith(admin)
  })

  it('calls each sub-registrar exactly once per invocation', () => {
    buildProgram()
    expect(vi.mocked(registerAdminScaffold)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(registerCreateAdmin)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(registerGenerateMeta)).toHaveBeenCalledTimes(1)
  })

  it('does not call sub-registrars before registerAdminCommands is invoked', () => {
    expect(vi.mocked(registerAdminScaffold)).not.toHaveBeenCalled()
    expect(vi.mocked(registerCreateAdmin)).not.toHaveBeenCalled()
    expect(vi.mocked(registerGenerateMeta)).not.toHaveBeenCalled()
  })
})