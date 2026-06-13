import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { runSetup, type RunSetupDeps } from '../../../src/commands/new/run-setup.js'

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(): RunSetupDeps {
  return {
    exec: vi.fn(),
    scaffoldAdmin: vi.fn().mockResolvedValue({
      written: ['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx', 'UserCreate.tsx'],
      skipped: [],
    }),
    generateAdminMeta: vi.fn().mockResolvedValue(undefined),
  }
}

const PROJECT_DIR = '/projects/my-app'
const BASE_OPTS = { projectDir: PROJECT_DIR }

// ── npm install ───────────────────────────────────────────────────────────────

describe('npm install', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs npm install with the project dir as cwd', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.exec).toHaveBeenCalledWith('npm install', PROJECT_DIR)
  })

  it('runs npm install before prisma migrate', async () => {
    const deps = makeDeps()
    const order: string[] = []
    vi.mocked(deps.exec).mockImplementation((cmd) => { order.push(cmd) })
    await runSetup(BASE_OPTS, deps)
    expect(order.indexOf('npm install')).toBeLessThan(
      order.findIndex((c) => c.includes('migrate')),
    )
  })
})

// ── prisma migrate ────────────────────────────────────────────────────────────

describe('prisma migrate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs prisma migrate dev with the project dir as cwd', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    const [cmd, cwd] = vi.mocked(deps.exec).mock.calls.find(([c]) =>
      c.includes('migrate'),
    )!
    expect(cmd).toContain('prisma migrate dev')
    expect(cwd).toBe(PROJECT_DIR)
  })

  it('names the first migration "init"', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    const [cmd] = vi.mocked(deps.exec).mock.calls.find(([c]) => c.includes('migrate'))!
    expect(cmd).toContain('--name init')
  })

  it('runs prisma migrate before scaffoldAdmin', async () => {
    const deps = makeDeps()
    let migrateOrder = 0
    let scaffoldOrder = 0
    let tick = 0
    vi.mocked(deps.exec).mockImplementation((cmd) => {
      if (cmd.includes('migrate')) migrateOrder = ++tick
    })
    vi.mocked(deps.scaffoldAdmin).mockImplementation(async () => {
      scaffoldOrder = ++tick
      return { written: [], skipped: [] }
    })
    await runSetup(BASE_OPTS, deps)
    expect(migrateOrder).toBeLessThan(scaffoldOrder)
  })
})

// ── scaffoldAdmin ─────────────────────────────────────────────────────────────

describe('scaffoldAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls scaffoldAdmin with the absolute Pages directory', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.scaffoldAdmin).toHaveBeenCalledWith({
      targetDir: join(PROJECT_DIR, 'resources/js/Pages'),
      force: false,
    })
  })

  it('calls scaffoldAdmin exactly once', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.scaffoldAdmin).toHaveBeenCalledTimes(1)
  })

  it('runs scaffoldAdmin before generateAdminMeta', async () => {
    const deps = makeDeps()
    let scaffoldOrder = 0
    let metaOrder = 0
    let tick = 0
    vi.mocked(deps.scaffoldAdmin).mockImplementation(async () => {
      scaffoldOrder = ++tick
      return { written: [], skipped: [] }
    })
    vi.mocked(deps.generateAdminMeta).mockImplementation(async () => {
      metaOrder = ++tick
    })
    await runSetup(BASE_OPTS, deps)
    expect(scaffoldOrder).toBeLessThan(metaOrder)
  })
})

// ── generateAdminMeta ─────────────────────────────────────────────────────────

describe('generateAdminMeta', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls generateAdminMeta with absolute schema path', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    const [schemaPath] = vi.mocked(deps.generateAdminMeta).mock.calls[0]!
    expect(schemaPath).toBe(join(PROJECT_DIR, 'prisma/schema.prisma'))
  })

  it('calls generateAdminMeta with absolute output path', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    const [, outputPath] = vi.mocked(deps.generateAdminMeta).mock.calls[0]!
    expect(outputPath).toBe(join(PROJECT_DIR, 'prisma/admin-meta.json'))
  })

  it('calls generateAdminMeta exactly once', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.generateAdminMeta).toHaveBeenCalledTimes(1)
  })
})

// ── create-admin subprocess ───────────────────────────────────────────────────

describe('create-admin subprocess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('spawns hypersonic admin create-admin with the project dir as cwd', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.exec).toHaveBeenCalledWith(
      'npx hypersonic admin create-admin',
      PROJECT_DIR,
    )
  })

  it('runs create-admin after generateAdminMeta', async () => {
    const deps = makeDeps()
    let metaOrder = 0
    let createOrder = 0
    let tick = 0
    vi.mocked(deps.generateAdminMeta).mockImplementation(async () => {
      metaOrder = ++tick
    })
    vi.mocked(deps.exec).mockImplementation((cmd) => {
      if (cmd.includes('create-admin')) createOrder = ++tick
    })
    await runSetup(BASE_OPTS, deps)
    expect(metaOrder).toBeLessThan(createOrder)
  })
})

// ── exec call count ───────────────────────────────────────────────────────────

describe('exec call count', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls exec exactly three times (npm install, prisma migrate, create-admin)', async () => {
    const deps = makeDeps()
    await runSetup(BASE_OPTS, deps)
    expect(deps.exec).toHaveBeenCalledTimes(3)
  })
})

// ── error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('propagates exec errors from npm install', async () => {
    const deps = makeDeps()
    vi.mocked(deps.exec).mockImplementationOnce(() => {
      throw new Error('npm not found')
    })
    await expect(runSetup(BASE_OPTS, deps)).rejects.toThrow('npm not found')
  })

  it('propagates exec errors from prisma migrate', async () => {
    const deps = makeDeps()
    vi.mocked(deps.exec)
      .mockImplementationOnce(() => undefined) // npm install succeeds
      .mockImplementationOnce(() => { throw new Error('migration failed') })
    await expect(runSetup(BASE_OPTS, deps)).rejects.toThrow('migration failed')
  })

  it('propagates scaffoldAdmin errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.scaffoldAdmin).mockRejectedValueOnce(new Error('disk full'))
    await expect(runSetup(BASE_OPTS, deps)).rejects.toThrow('disk full')
  })

  it('propagates generateAdminMeta errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.generateAdminMeta).mockRejectedValueOnce(new Error('bad schema'))
    await expect(runSetup(BASE_OPTS, deps)).rejects.toThrow('bad schema')
  })

  it('propagates create-admin exec errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.exec)
      .mockImplementationOnce(() => undefined) // npm install
      .mockImplementationOnce(() => undefined) // prisma migrate
      .mockImplementationOnce(() => { throw new Error('create-admin failed') })
    await expect(runSetup(BASE_OPTS, deps)).rejects.toThrow('create-admin failed')
  })
})