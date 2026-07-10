import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join, dirname } from 'node:path'
import {
  generateFiles,
  applySubstitutions,
  TEMPLATE_FILES,
  type GenerateFilesDeps,
  type GenerateFilesOptions,
} from '../../../src/commands/new/generate-files.js'

const mockReadFileSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockWriteFileSync = vi.fn()
vi.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeps(fileContents: Record<string, string> = {}): GenerateFilesDeps {
  return {
    // Normalize backslashes to forward slashes before the dictionary lookup so
    // that tests using forward-slash keys (e.g. '/fake/templates/new/package.json')
    // work correctly on Windows, where path.join produces backslash paths.
    readFile: vi.fn((p: string) => {
      const key = p.replace(/\\/g, '/')
      return fileContents[key] ?? 'template content'
    }),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    templatesDir: '/fake/templates/new',
  }
}

const BASE_OPTS: GenerateFilesOptions = {
  projectDir: '/projects/my-app',
  projectName: 'my-app',
  secret: 'abc123secret',
}

// ── applySubstitutions ────────────────────────────────────────────────────────

describe('applySubstitutions', () => {
  it('replaces a single placeholder', () => {
    expect(applySubstitutions('hello {{NAME}}', { NAME: 'world' })).toBe('hello world')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    expect(applySubstitutions('{{X}} and {{X}}', { X: 'foo' })).toBe('foo and foo')
  })

  it('replaces multiple distinct placeholders', () => {
    expect(
      applySubstitutions('{{A}} {{B}}', { A: 'hello', B: 'world' }),
    ).toBe('hello world')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(applySubstitutions('{{UNKNOWN}}', { OTHER: 'x' })).toBe('{{UNKNOWN}}')
  })

  it('returns the string unchanged when vars is empty', () => {
    expect(applySubstitutions('no placeholders', {})).toBe('no placeholders')
  })

  it('handles an empty string', () => {
    expect(applySubstitutions('', { NAME: 'x' })).toBe('')
  })

  it('falls back to the original placeholder when the key exists but its value is undefined', () => {
    // Record<string, string> disallows this at the type level, but a caller
    // building vars dynamically (e.g. from a partial object) could still
    // produce this at runtime — the `?? match` fallback guards against it.
    const vars = { NAME: undefined } as unknown as Record<string, string>
    expect(applySubstitutions('hello {{NAME}}', vars)).toBe('hello {{NAME}}')
  })
})

// ── TEMPLATE_FILES manifest ───────────────────────────────────────────────────

describe('TEMPLATE_FILES', () => {
  it('is a non-empty array', () => {
    expect(TEMPLATE_FILES.length).toBeGreaterThan(0)
  })

  it('maps _env src to .env dest', () => {
    const entry = TEMPLATE_FILES.find((f) => f.src === '_env')
    expect(entry).toBeDefined()
    expect(entry!.dest).toBe('.env')
  })

  it('maps _gitignore src to .gitignore dest', () => {
    const entry = TEMPLATE_FILES.find((f) => f.src === '_gitignore')
    expect(entry).toBeDefined()
    expect(entry!.dest).toBe('.gitignore')
  })

  it('contains package.json', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'package.json')).toBe(true)
  })

  it('contains hypersonic.config.ts', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'hypersonic.config.ts')).toBe(true)
  })

  it('contains .env.example', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === '.env.example')).toBe(true)
  })

  it('contains .gitignore', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === '.gitignore')).toBe(true)
  })

  it('contains tsconfig.json', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'tsconfig.json')).toBe(true)
  })

  it('contains eslint.config.js', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'eslint.config.js')).toBe(true)
  })

  it('contains vite.config.ts', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'vite.config.ts')).toBe(true)
  })

  it('contains prisma/schema.prisma', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'prisma/schema.prisma')).toBe(true)
  })

  it('contains prisma.config.ts', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'prisma.config.ts')).toBe(true)
  })

  it('contains server.ts', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'server.ts')).toBe(true)
  })

  it('contains resources/css/app.css', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'resources/css/app.css')).toBe(true)
  })

  it('contains resources/js/app.tsx', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'resources/js/app.tsx')).toBe(true)
  })

  it('contains resources/js/Pages/Welcome.tsx', () => {
    expect(TEMPLATE_FILES.some((f) => f.dest === 'resources/js/Pages/Welcome.tsx')).toBe(true)
  })

  it('has no dest path that starts with a dot except .env and .env.example and .gitignore', () => {
    const dotFiles = TEMPLATE_FILES.filter((f) => f.dest.startsWith('.'))
    const allowed = new Set(['.env', '.env.example', '.gitignore'])
    for (const { dest } of dotFiles) {
      expect(allowed.has(dest)).toBe(true)
    }
  })

  it('has no src path named .env (would be git-ignored)', () => {
    expect(TEMPLATE_FILES.every((f) => f.src !== '.env')).toBe(true)
  })

  it('has no src path named .gitignore (would be stripped by npm)', () => {
    expect(TEMPLATE_FILES.every((f) => f.src !== '.gitignore')).toBe(true)
  })
})

// ── generateFiles ─────────────────────────────────────────────────────────────

describe('generateFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads each template file from templatesDir', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    for (const { src } of TEMPLATE_FILES) {
      expect(deps.readFile).toHaveBeenCalledWith(
        join('/fake/templates/new', src),
      )
    }
  })

  it('calls mkdir for the parent directory of each dest file', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    for (const { dest } of TEMPLATE_FILES) {
      expect(deps.mkdir).toHaveBeenCalledWith(
        dirname(join(BASE_OPTS.projectDir, dest)),
      )
    }
  })

  it('calls writeFile for each dest file under projectDir', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    for (const { dest } of TEMPLATE_FILES) {
      expect(deps.writeFile).toHaveBeenCalledWith(
        join(BASE_OPTS.projectDir, dest),
        expect.any(String),
      )
    }
  })

  it('substitutes {{PROJECT_NAME}} in template content', async () => {
    const deps = makeDeps({ '/fake/templates/new/package.json': '{"name":"{{PROJECT_NAME}}"}' })
    await generateFiles(BASE_OPTS, deps)
    expect(deps.writeFile).toHaveBeenCalledWith(
      join(BASE_OPTS.projectDir, 'package.json'),
      '{"name":"my-app"}',
    )
  })

  it('substitutes {{SECRET}} in template content', async () => {
    const deps = makeDeps({ '/fake/templates/new/_env': 'SECRET="{{SECRET}}"' })
    await generateFiles(BASE_OPTS, deps)
    expect(deps.writeFile).toHaveBeenCalledWith(
      join(BASE_OPTS.projectDir, '.env'),
      'SECRET="abc123secret"',
    )
  })

  it('writes _env template to .env dest path', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    const destPaths = vi.mocked(deps.writeFile).mock.calls.map(([p]) => p)
    expect(destPaths).toContain(join(BASE_OPTS.projectDir, '.env'))
    expect(destPaths.every((p) => !p.endsWith('_env'))).toBe(true)
  })

  it('writes _gitignore template to .gitignore dest path', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    const destPaths = vi.mocked(deps.writeFile).mock.calls.map(([p]) => p)
    expect(destPaths).toContain(join(BASE_OPTS.projectDir, '.gitignore'))
    expect(destPaths.every((p) => !p.endsWith('_gitignore'))).toBe(true)
  })

  it('returns one WrittenFile entry per template file', async () => {
    const deps = makeDeps()
    const result = await generateFiles(BASE_OPTS, deps)
    expect(result).toHaveLength(TEMPLATE_FILES.length)
  })

  it('returned entries contain the dest path', async () => {
    const deps = makeDeps()
    const result = await generateFiles(BASE_OPTS, deps)
    const dests = result.map((f) => f.dest)
    expect(dests).toContain('package.json')
    expect(dests).toContain('.env')
    expect(dests).toContain('resources/js/Pages/Welcome.tsx')
  })

  it('calls readFile exactly once per template file', async () => {
    const deps = makeDeps()
    await generateFiles(BASE_OPTS, deps)
    expect(deps.readFile).toHaveBeenCalledTimes(TEMPLATE_FILES.length)
  })

  it('propagates readFile errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.readFile).mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    await expect(generateFiles(BASE_OPTS, deps)).rejects.toThrow('ENOENT')
  })

  it('propagates writeFile errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.writeFile).mockImplementationOnce(() => {
      throw new Error('ENOSPC')
    })
    await expect(generateFiles(BASE_OPTS, deps)).rejects.toThrow('ENOSPC')
  })

  it('propagates mkdir errors', async () => {
    const deps = makeDeps()
    vi.mocked(deps.mkdir).mockImplementationOnce(() => {
      throw new Error('EACCES')
    })
    await expect(generateFiles(BASE_OPTS, deps)).rejects.toThrow('EACCES')
  })
})

// ── default deps (real makeDefaultDeps) ─────────────────────────────────────
//
// generateFiles's `deps` parameter defaults to makeDefaultDeps() (a real,
// unexported function wiring up real readFileSync/mkdirSync/writeFileSync and
// a templatesDir derived from import.meta.url). The tests above always pass
// an explicit `deps`, so that default path — and its real fs wiring — is
// exercised here instead, fully mocked so no real disk I/O occurs.

describe('generateFiles — default deps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFileSync.mockReturnValue('template content')
  })

  it('resolves readFile/mkdir/writeFile from real node:fs when deps is omitted', async () => {
    const result = await generateFiles(BASE_OPTS)
    expect(mockReadFileSync).toHaveBeenCalledTimes(TEMPLATE_FILES.length)
    expect(mockMkdirSync).toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalled()
    expect(result).toHaveLength(TEMPLATE_FILES.length)
  })

  it('mkdir is called with recursive: true', async () => {
    await generateFiles(BASE_OPTS)
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
  })

  it('writeFile is called with utf-8 encoding', async () => {
    await generateFiles(BASE_OPTS)
    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'utf-8')
  })

  it('readFile is called with utf-8 encoding', async () => {
    await generateFiles(BASE_OPTS)
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.any(String), 'utf-8')
  })
})