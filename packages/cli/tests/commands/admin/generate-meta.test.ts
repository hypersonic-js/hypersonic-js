import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { Command } from 'commander'
import { runGenerateMeta, registerGenerateMeta, type GenerateMetaDeps } from '../../../src/commands/admin/generate-meta.js'

vi.mock('../../../src/dmmf/parser.js', () => ({
  parseDmmf: vi.fn().mockReturnValue([{ name: 'Post', urlSlug: 'post' }]),
}))

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { parseDmmf } from '../../../src/dmmf/parser.js'
import { logger } from '../../../src/utils/logger.js'
const mockParseDmmf = vi.mocked(parseDmmf)

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_DMMF = { datamodel: { models: [], enums: [] } }

function makeDeps(): GenerateMetaDeps {
  return {
    getDMMF: vi.fn().mockResolvedValue(FAKE_DMMF),
    readFile: vi.fn().mockReturnValue('schema content'),
    writeFile: vi.fn(),
  }
}

function buildAdminCommand(deps?: GenerateMetaDeps): Command {
  const program = new Command()
  program.exitOverride()
  const admin = program.command('admin')
  registerGenerateMeta(admin, deps)
  return program
}

// ── runGenerateMeta ───────────────────────────────────────────────────────────

describe('runGenerateMeta', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the schema file from the resolved path', async () => {
    const deps = makeDeps()
    await runGenerateMeta({ schema: 'prisma/schema.prisma', output: 'out.json' }, deps)
    expect(deps.readFile).toHaveBeenCalledWith(resolve('prisma/schema.prisma'))
  })

  it('passes schema content to getDMMF', async () => {
    const deps = makeDeps()
    await runGenerateMeta({ schema: 'prisma/schema.prisma', output: 'out.json' }, deps)
    expect(deps.getDMMF).toHaveBeenCalledWith({ datamodel: 'schema content' })
  })

  it('writes parsed models as formatted JSON to the resolved output path', async () => {
    const deps = makeDeps()
    await runGenerateMeta({ schema: 'prisma/schema.prisma', output: 'prisma/admin-meta.json' }, deps)
    expect(deps.writeFile).toHaveBeenCalledWith(
      resolve('prisma/admin-meta.json'),
      JSON.stringify([{ name: 'Post', urlSlug: 'post' }], null, 2),
    )
  })

  it('calls parseDmmf with the DMMF returned by getDMMF', async () => {
    const deps = makeDeps()
    await runGenerateMeta({ schema: 'prisma/schema.prisma', output: 'out.json' }, deps)
    expect(mockParseDmmf).toHaveBeenCalledWith(FAKE_DMMF)
  })

  it('rejects when getDMMF rejects', async () => {
    const deps = makeDeps()
    vi.mocked(deps.getDMMF).mockRejectedValue(new Error('bad schema'))
    await expect(runGenerateMeta({ schema: 'a', output: 'b' }, deps)).rejects.toThrow('bad schema')
  })

  it('throws when readFile throws', async () => {
    const deps = makeDeps()
    vi.mocked(deps.readFile).mockImplementation(() => { throw new Error('file not found') })
    await expect(runGenerateMeta({ schema: 'missing.prisma', output: 'out.json' }, deps)).rejects.toThrow('file not found')
  })
})

// ── command structure ─────────────────────────────────────────────────────────

describe('registerGenerateMeta command structure', () => {
  it('registers generate-meta as a subcommand of admin', () => {
    const program = buildAdminCommand()
    const adminCmd = program.commands.find((c) => c.name() === 'admin')!
    expect(adminCmd.commands.find((c) => c.name() === 'generate-meta')).toBeDefined()
  })

  it('has a description', () => {
    const program = buildAdminCommand()
    const adminCmd = program.commands.find((c) => c.name() === 'admin')!
    const cmd = adminCmd.commands.find((c) => c.name() === 'generate-meta')!
    expect(cmd.description()).toBeTruthy()
  })

  it('--schema option defaults to prisma/schema.prisma', () => {
    const program = buildAdminCommand()
    const adminCmd = program.commands.find((c) => c.name() === 'admin')!
    const cmd = adminCmd.commands.find((c) => c.name() === 'generate-meta')!
    const opt = cmd.options.find((o) => o.long === '--schema')
    expect(opt).toBeDefined()
    expect(opt!.defaultValue).toBe('prisma/schema.prisma')
  })

  it('--output option defaults to prisma/admin-meta.json', () => {
    const program = buildAdminCommand()
    const adminCmd = program.commands.find((c) => c.name() === 'admin')!
    const cmd = adminCmd.commands.find((c) => c.name() === 'generate-meta')!
    const opt = cmd.options.find((o) => o.long === '--output')
    expect(opt).toBeDefined()
    expect(opt!.defaultValue).toBe('prisma/admin-meta.json')
  })

  it('invokes runGenerateMeta with the correct options when executed', async () => {
    const deps = makeDeps()
    const program = buildAdminCommand(deps)
    await program.parseAsync(['node', 'hypersonic', 'admin', 'generate-meta', '--schema', 'custom/schema.prisma', '--output', 'custom/meta.json'])
    expect(deps.getDMMF).toHaveBeenCalledTimes(1)
    expect(deps.writeFile).toHaveBeenCalledWith(resolve('custom/meta.json'), expect.any(String))
  })
})

// ── action error handling ─────────────────────────────────────────────────────

describe('registerGenerateMeta action error handling', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code})`)
    })
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('calls logger.error with the message when an Error is thrown', async () => {
    const deps = makeDeps()
    vi.mocked(deps.readFile).mockImplementation(() => { throw new Error('ENOENT: file not found') })
    const program = buildAdminCommand(deps)
    await expect(
      program.parseAsync(['node', 'hypersonic', 'admin', 'generate-meta']),
    ).rejects.toThrow('process.exit(1)')
    expect(logger.error).toHaveBeenCalledWith('ENOENT: file not found')
  })

  it('calls logger.error with String(err) when a non-Error is thrown', async () => {
    const deps = makeDeps()
    vi.mocked(deps.getDMMF).mockRejectedValue('invalid schema string')
    const program = buildAdminCommand(deps)
    await expect(
      program.parseAsync(['node', 'hypersonic', 'admin', 'generate-meta']),
    ).rejects.toThrow('process.exit(1)')
    expect(logger.error).toHaveBeenCalledWith('invalid schema string')
  })

  it('calls process.exit(1) when runGenerateMeta throws', async () => {
    const deps = makeDeps()
    vi.mocked(deps.getDMMF).mockRejectedValue(new Error('bad dmmf'))
    const program = buildAdminCommand(deps)
    await expect(
      program.parseAsync(['node', 'hypersonic', 'admin', 'generate-meta']),
    ).rejects.toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('does not call process.exit on the happy path', async () => {
    const deps = makeDeps()
    const program = buildAdminCommand(deps)
    await program.parseAsync(['node', 'hypersonic', 'admin', 'generate-meta'])
    expect(exitSpy).not.toHaveBeenCalled()
  })
})