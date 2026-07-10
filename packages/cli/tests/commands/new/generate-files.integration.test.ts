/**
 * Integration tests for generateFiles.
 *
 * These tests call generateFiles with no mocked deps — real fs operations
 * against a temp directory. They verify that the substitution pipeline and
 * file-writing work end to end, and that the output on disk is exactly what
 * a scaffolded project should contain.
 *
 * Template content correctness is handled separately in templates.test.ts.
 * Orchestration logic is handled separately in generate-files.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateFiles, TEMPLATE_FILES } from '../../../src/commands/new/generate-files.js'

// ── Temp directory setup ──────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'hypersonic-new-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── Every file is written ─────────────────────────────────────────────────────

describe('generateFiles — all files written', () => {
  it('writes every file listed in TEMPLATE_FILES', async () => {
    await generateFiles({
      projectDir: tmpDir,
      projectName: 'test-project',
      secret: 'a'.repeat(64),
    })

    for (const { dest } of TEMPLATE_FILES) {
      expect(existsSync(join(tmpDir, dest)), `expected ${dest} to exist`).toBe(true)
    }
  })

  it('returns one WrittenFile entry per template', async () => {
    const result = await generateFiles({
      projectDir: tmpDir,
      projectName: 'test-project',
      secret: 'a'.repeat(64),
    })
    expect(result).toHaveLength(TEMPLATE_FILES.length)
  })

  it('returned dest paths match the TEMPLATE_FILES manifest', async () => {
    const result = await generateFiles({
      projectDir: tmpDir,
      projectName: 'test-project',
      secret: 'a'.repeat(64),
    })
    const dests = result.map((f) => f.dest)
    for (const { dest } of TEMPLATE_FILES) {
      expect(dests).toContain(dest)
    }
  })
})

// ── {{PROJECT_NAME}} substitution ─────────────────────────────────────────────

describe('generateFiles — PROJECT_NAME substitution', () => {
  it('substitutes the project name in package.json', async () => {
    await generateFiles({
      projectDir: tmpDir,
      projectName: 'my-cool-app',
      secret: 'x'.repeat(64),
    })
    const content = readFileSync(join(tmpDir, 'package.json'), 'utf-8')
    expect(JSON.parse(content).name).toBe('my-cool-app')
  })

  it('does not leave any {{PROJECT_NAME}} placeholder in the output', async () => {
    await generateFiles({
      projectDir: tmpDir,
      projectName: 'my-cool-app',
      secret: 'x'.repeat(64),
    })
    for (const { dest } of TEMPLATE_FILES) {
      const content = readFileSync(join(tmpDir, dest), 'utf-8')
      expect(content, `${dest} still contains {{PROJECT_NAME}}`).not.toContain(
        '{{PROJECT_NAME}}',
      )
    }
  })
})

// ── {{SECRET}} substitution ───────────────────────────────────────────────────

describe('generateFiles — SECRET substitution', () => {
  it('substitutes the secret into the .env file', async () => {
    const secret = 'b'.repeat(64)
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret })
    const content = readFileSync(join(tmpDir, '.env'), 'utf-8')
    expect(content).toContain(secret)
  })

  it('does not leave any {{SECRET}} placeholder in the output', async () => {
    await generateFiles({
      projectDir: tmpDir,
      projectName: 'app',
      secret: 'c'.repeat(64),
    })
    for (const { dest } of TEMPLATE_FILES) {
      const content = readFileSync(join(tmpDir, dest), 'utf-8')
      expect(content, `${dest} still contains {{SECRET}}`).not.toContain('{{SECRET}}')
    }
  })
})

// ── _env → .env rename ────────────────────────────────────────────────────────

describe('generateFiles — _env rename', () => {
  it('writes a .env file', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'd'.repeat(64) })
    expect(existsSync(join(tmpDir, '.env'))).toBe(true)
  })

  it('does not write a file named _env', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'd'.repeat(64) })
    expect(existsSync(join(tmpDir, '_env'))).toBe(false)
  })
})

// ── _gitignore → .gitignore rename ────────────────────────────────────────────

describe('generateFiles — _gitignore rename', () => {
  it('writes a .gitignore file', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'd'.repeat(64) })
    expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true)
  })

  it('does not write a file named _gitignore', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'd'.repeat(64) })
    expect(existsSync(join(tmpDir, '_gitignore'))).toBe(false)
  })
})

// ── Nested directories created ────────────────────────────────────────────────

describe('generateFiles — directory creation', () => {
  it('creates the prisma/ directory', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'e'.repeat(64) })
    expect(existsSync(join(tmpDir, 'prisma'))).toBe(true)
  })

  it('creates the resources/css/ directory', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'e'.repeat(64) })
    expect(existsSync(join(tmpDir, 'resources/css'))).toBe(true)
  })

  it('creates the resources/js/Pages/ directory', async () => {
    await generateFiles({ projectDir: tmpDir, projectName: 'app', secret: 'e'.repeat(64) })
    expect(existsSync(join(tmpDir, 'resources/js/Pages'))).toBe(true)
  })
})

// ── File content spot-checks ──────────────────────────────────────────────────

describe('generateFiles — output content', () => {
  beforeEach(async () => {
    await generateFiles({
      projectDir: tmpDir,
      projectName: 'spot-check-app',
      secret: 'f'.repeat(64),
    })
  })

  it('package.json is valid JSON with the correct name', () => {
    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('spot-check-app')
    expect(pkg.type).toBe('module')
  })

  it('tsconfig.json is valid JSON', () => {
    expect(() =>
      JSON.parse(readFileSync(join(tmpDir, 'tsconfig.json'), 'utf-8')),
    ).not.toThrow()
  })

  it('.env contains the substituted secret', () => {
    const content = readFileSync(join(tmpDir, '.env'), 'utf-8')
    expect(content).toContain('f'.repeat(64))
  })

  it('.env.example does not contain the substituted secret', () => {
    const content = readFileSync(join(tmpDir, '.env.example'), 'utf-8')
    expect(content).not.toContain('f'.repeat(64))
  })

  it('server.ts imports from @hypersonic-js/complete', () => {
    const content = readFileSync(join(tmpDir, 'server.ts'), 'utf-8')
    expect(content).toContain('@hypersonic-js/complete')
  })

  it('Welcome.tsx exports a default function', () => {
    const content = readFileSync(
      join(tmpDir, 'resources/js/Pages/Welcome.tsx'),
      'utf-8',
    )
    expect(content).toContain('export default function Welcome')
  })

  it('prisma/schema.prisma uses the sqlite provider', () => {
    const content = readFileSync(join(tmpDir, 'prisma/schema.prisma'), 'utf-8')
    expect(content).toContain('provider = "sqlite"')
  })
})