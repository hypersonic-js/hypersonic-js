import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { Command } from 'commander'
import { registerNewCommand, type NewCommandDeps } from '../../../src/commands/new/index.js'

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<NewCommandDeps> = {}): NewCommandDeps {
  return {
    prompt: vi.fn().mockResolvedValue(''),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    generateFiles: vi.fn().mockResolvedValue([]),
    runSetup: vi.fn().mockResolvedValue(undefined),
    randomBytes: vi.fn().mockReturnValue(Buffer.alloc(32, 0xab)),
    cwd: vi.fn().mockReturnValue('/current/dir'),
    ...overrides,
  }
}

/** Returns a prompt mock that answers each call from the provided list in order. */
function answers(...values: string[]): ReturnType<typeof vi.fn> {
  let i = 0
  return vi.fn().mockImplementation(() => Promise.resolve(values[i++] ?? ''))
}

function buildProgram(deps?: NewCommandDeps): Command {
  const program = new Command()
  program.exitOverride()
  registerNewCommand(program, deps)
  return program
}

async function runNew(deps: NewCommandDeps): Promise<void> {
  await buildProgram(deps).parseAsync(['node', 'hypersonic', 'new'])
}

// ── Command structure ─────────────────────────────────────────────────────────

describe('command structure', () => {
  it('registers a "new" command on the program', () => {
    const cmd = buildProgram().commands.find((c) => c.name() === 'new')
    expect(cmd).toBeDefined()
  })

  it('has a non-empty description', () => {
    const cmd = buildProgram().commands.find((c) => c.name() === 'new')!
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('accepts no declared arguments', () => {
    const cmd = buildProgram().commands.find((c) => c.name() === 'new')!
    expect(cmd.registeredArguments).toHaveLength(0)
  })

  it('accepts no options', () => {
    const cmd = buildProgram().commands.find((c) => c.name() === 'new')!
    expect(cmd.options).toHaveLength(0)
  })
})

// ── New directory flow ────────────────────────────────────────────────────────

describe('new directory flow (choice "1")', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a subdirectory named after the project', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.mkdirSync).toHaveBeenCalledWith(
      join('/current/dir', 'my-app'),
      { recursive: true },
    )
  })

  it('passes the subdirectory path as projectDir to generateFiles', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: join('/current/dir', 'my-app') }),
    )
  })

  it('passes the project name to generateFiles', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'my-app' }),
    )
  })

  it('passes projectDir to runSetup', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.runSetup).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: join('/current/dir', 'my-app') }),
    )
  })

  it('checks the target project directory for existing files', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.readdirSync).toHaveBeenCalledWith(join('/current/dir', 'my-app'))
  })

  it('treats an empty choice (pressing enter) as option 1', async () => {
    const deps = makeDeps({ prompt: answers('', 'my-app') })
    await runNew(deps)
    expect(deps.mkdirSync).toHaveBeenCalled()
  })
})

// ── Current directory flow ────────────────────────────────────────────────────

describe('current directory flow (choice "2")', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not call mkdirSync', async () => {
    const deps = makeDeps({ prompt: answers('2', 'my-app') })
    await runNew(deps)
    expect(deps.mkdirSync).not.toHaveBeenCalled()
  })

  it('passes cwd() as projectDir to generateFiles', async () => {
    const deps = makeDeps({
      prompt: answers('2', 'my-app'),
      cwd: vi.fn().mockReturnValue('/current/dir'),
    })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: '/current/dir' }),
    )
  })
})

// ── Non-empty directory warning (current dir) ─────────────────────────────────

describe('non-empty directory warning', () => {
  beforeEach(() => vi.clearAllMocks())

  it('checks directory contents when using current dir', async () => {
    const deps = makeDeps({
      prompt: answers('2', 'y', 'my-app'),
      readdirSync: vi.fn().mockReturnValue(['existing.txt']),
    })
    await runNew(deps)
    expect(deps.readdirSync).toHaveBeenCalledWith('/current/dir')
  })

  it('warns when current directory has existing files', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('2', 'y', 'my-app'),
      readdirSync: vi.fn().mockReturnValue(['a.txt', 'b.txt']),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('not empty'),
    )
  })

  it('includes file count in the warning', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('2', 'y', 'my-app'),
      readdirSync: vi.fn().mockReturnValue(['a.txt', 'b.txt', 'c.txt']),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(expect.stringContaining('3'))
  })

  it('aborts without calling generateFiles when user answers "n"', async () => {
    const deps = makeDeps({
      prompt: answers('2', 'n'),
      readdirSync: vi.fn().mockReturnValue(['file.txt']),
    })
    await runNew(deps)
    expect(deps.generateFiles).not.toHaveBeenCalled()
  })

  it('proceeds when user confirms with "y"', async () => {
    const deps = makeDeps({
      prompt: answers('2', 'y', 'my-app'),
      readdirSync: vi.fn().mockReturnValue(['file.txt']),
    })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalled()
  })

  it('does not warn or prompt for confirmation when directory is empty', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
     prompt: answers('2', 'my-app'),
     readdirSync: vi.fn().mockReturnValue([]),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
    expect(deps.prompt).toHaveBeenCalledTimes(2) // dir choice + project name only
   })
})

// ── New directory overwrite guard ─────────────────────────────────────────────

describe('new directory overwrite guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('proceeds without warning when target directory does not exist', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('1', 'my-app'),
      readdirSync: vi.fn().mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      }),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
    expect(deps.generateFiles).toHaveBeenCalled()
  })

  it('proceeds without warning when target directory is empty', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('1', 'my-app'),
      readdirSync: vi.fn().mockReturnValue([]),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
  })

  it('warns when target directory already exists and is not empty', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('1', 'my-app', 'y'),
      readdirSync: vi.fn().mockReturnValue(['README.md']),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('not empty'),
    )
  })

  it('includes file count in the overwrite warning', async () => {
    const { logger } = await import('../../../src/utils/logger.js')
    const deps = makeDeps({
      prompt: answers('1', 'my-app', 'y'),
      readdirSync: vi.fn().mockReturnValue(['a.txt', 'b.txt']),
    })
    await runNew(deps)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('2'),
    )
  })

  it('aborts without calling generateFiles when user declines overwrite', async () => {
    const deps = makeDeps({
      prompt: answers('1', 'my-app', 'n'),
      readdirSync: vi.fn().mockReturnValue(['README.md']),
    })
    await runNew(deps)
    expect(deps.generateFiles).not.toHaveBeenCalled()
  })

  it('proceeds when user confirms overwrite of existing directory', async () => {
    const deps = makeDeps({
      prompt: answers('1', 'my-app', 'y'),
      readdirSync: vi.fn().mockReturnValue(['README.md']),
    })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalled()
  })
})

// ── Project name validation ───────────────────────────────────────────────────

describe('project name validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trims whitespace from the project name', async () => {
    const deps = makeDeps({ prompt: answers('1', '  my-app  ') })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'my-app' }),
    )
  })

  it('calls process.exit(1) when project name is whitespace only', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?) => { throw new Error('process.exit') })
    const deps = makeDeps({ prompt: answers('1', '   ') })
    await expect(runNew(deps)).rejects.toThrow('process.exit')
    exitSpy.mockRestore()
  })

  it('does not call generateFiles when project name is empty', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => { throw new Error('exit') })
    const deps = makeDeps({ prompt: answers('1', '') })
    await expect(runNew(deps)).rejects.toThrow()
    expect(deps.generateFiles).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})

// ── Secret generation ─────────────────────────────────────────────────────────

describe('secret generation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates a 32-byte secret', async () => {
    const deps = makeDeps({ prompt: answers('1', 'my-app') })
    await runNew(deps)
    expect(deps.randomBytes).toHaveBeenCalledWith(32)
  })

  it('passes the hex-encoded secret to generateFiles', async () => {
    const buf = Buffer.alloc(32, 0xcd)
    const deps = makeDeps({
      prompt: answers('1', 'my-app'),
      randomBytes: vi.fn().mockReturnValue(buf),
    })
    await runNew(deps)
    expect(deps.generateFiles).toHaveBeenCalledWith(
      expect.objectContaining({ secret: buf.toString('hex') }),
    )
  })
})

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('generateFiles runs before runSetup', () => {
  it('calls generateFiles before runSetup', async () => {
    const order: string[] = []
    const deps = makeDeps({
      prompt: answers('1', 'my-app'),
      generateFiles: vi.fn().mockImplementation(async () => { order.push('generate'); return [] }),
      runSetup: vi.fn().mockImplementation(async () => { order.push('setup') }),
    })
    await runNew(deps)
    expect(order.indexOf('generate')).toBeLessThan(order.indexOf('setup'))
  })
})