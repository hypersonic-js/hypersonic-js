/**
 * End-to-end smoke test for `hypersonic new`.
 *
 * Every other test touching this pipeline (index.test.ts, generate-files.test.ts,
 * generate-files.integration.test.ts, run-setup.test.ts) exercises one layer at a
 * time, mocking its neighbors. That's the right call for fast, deterministic unit
 * coverage — but it means no test ever runs the *real* pipeline start to finish, so
 * a wiring bug between layers (right call, wrong shape; a template that no longer
 * produces a valid Prisma schema; a schema change the DMMF parser can't handle)
 * could slip through even with every layer individually green.
 *
 * This file closes that gap. It drives registerNewCommand() through a real
 * Commander program against a real temp directory, using the real generateFiles,
 * the real @hypersonic-js/admin scaffoldAdmin, and the real DMMF pipeline
 * (@prisma/get-dmmf → parseDmmf → admin-meta.json) — no mocked deps for any of
 * those. @prisma/get-dmmf resolves via @prisma/prisma-schema-wasm, not a
 * downloaded engine binary, so this runs fully offline.
 *
 * The one thing that stays stubbed is `exec` (npm install / prisma migrate dev /
 * prisma generate / the create-admin subprocess) — those steps are genuinely
 * expensive and network/binary-bound, and are exactly what apps/test-app's Docker-
 * backed suite exists to verify for real. Stubbing them here just records what was
 * called, so this test still confirms they run in the right order against the
 * right directory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Command } from 'commander'
import { getDMMF } from '@prisma/get-dmmf'
import { scaffoldAdmin } from '@hypersonic-js/admin'

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { registerNewCommand, type NewCommandDeps } from '../../../src/commands/new/index.js'
import { runSetup, type RunSetupDeps } from '../../../src/commands/new/run-setup.js'
import { generateFiles, TEMPLATE_FILES } from '../../../src/commands/new/generate-files.js'
import { runGenerateMeta } from '../../../src/commands/admin/generate-meta.js'

const ADMIN_PAGE_FILES = ['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx', 'UserCreate.tsx'] as const

// ── The one stubbed seam ─────────────────────────────────────────────────────
//
// Records each `exec` call instead of actually spawning npm/prisma/hypersonic
// subprocesses. Everything else in RunSetupDeps below is the real production
// wiring — the same functions runSetup's own loadDeps() would resolve.

let execCalls: Array<{ command: string; cwd: string }>

function makeRealRunSetupDeps(): RunSetupDeps {
  return {
    exec: (command, cwd) => {
      execCalls.push({ command, cwd })
    },
    scaffoldAdmin,
    generateAdminMeta: (schemaPath, outputPath) =>
      runGenerateMeta(
        { schema: schemaPath, output: outputPath },
        {
          getDMMF,
          readFile: (p) => readFileSync(p, 'utf-8'),
          writeFile: (p, c) => writeFileSync(p, c),
        },
      ),
  }
}

/** Builds real NewCommandDeps — only `prompt` is a canned, scripted stub. */
function makeRealDeps(cwdDir: string, promptAnswers: string[]): NewCommandDeps {
  let call = 0
  return {
    prompt: async () => promptAnswers[call++] ?? '',
    readdirSync: (p) => readdirSync(p),
    mkdirSync: (p, opts) => mkdirSync(p, opts),
    generateFiles,
    runSetup: (opts) => runSetup(opts, makeRealRunSetupDeps()),
    randomBytes,
    cwd: () => cwdDir,
  }
}

async function runNewCommand(deps: NewCommandDeps): Promise<void> {
  const program = new Command()
  program.exitOverride()
  registerNewCommand(program, deps)
  await program.parseAsync(['node', 'hypersonic', 'new'])
}

// ── Temp directory setup ──────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'hypersonic-new-smoke-'))
  execCalls = []
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── New subdirectory flow ─────────────────────────────────────────────────────

describe('hypersonic new — new subdirectory, end to end', () => {
  it('produces a fully-scaffolded, real project on disk', async () => {
    const deps = makeRealDeps(tmpDir, ['1', 'my-app'])
    await runNewCommand(deps)

    const projectDir = join(tmpDir, 'my-app')

    // Every templated file was really written by the real generateFiles.
    for (const { dest } of TEMPLATE_FILES) {
      expect(existsSync(join(projectDir, dest)), `expected ${dest} to exist`).toBe(true)
    }

    // Substitutions applied for real, by the real applySubstitutions pipeline.
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as { name: string }
    expect(pkg.name).toBe('my-app')

    const env = readFileSync(join(projectDir, '.env'), 'utf-8')
    expect(env).toMatch(/BETTER_AUTH_SECRET="[0-9a-f]{64}"/)

    // Admin pages really scaffolded by the real @hypersonic-js/admin scaffoldAdmin.
    for (const file of ADMIN_PAGE_FILES) {
      expect(existsSync(join(projectDir, 'resources/js/Pages/Admin', file))).toBe(true)
    }

    // admin-meta.json really generated by parsing the real, generated schema.prisma
    // through the real WASM-backed getDMMF and the real parseDmmf.
    const meta = JSON.parse(readFileSync(join(projectDir, 'prisma/admin-meta.json'), 'utf-8')) as Array<{
      name: string
    }>
    const modelNames = meta.map((m) => m.name)
    expect(modelNames).toEqual(expect.arrayContaining(['User', 'Session', 'Account']))

    // The one stubbed step ran, in order, against the real project directory.
    expect(execCalls.map((c) => c.command)).toEqual([
      'npm install',
      'npx prisma migrate dev --name init',
      'npx prisma generate',
      'npx hypersonic admin create-admin',
    ])
    expect(execCalls.every((c) => c.cwd === projectDir)).toBe(true)
  })
})

// ── Current directory flow ────────────────────────────────────────────────────

describe('hypersonic new — current directory, end to end', () => {
  it('scaffolds directly into an empty cwd rather than a subdirectory', async () => {
    const deps = makeRealDeps(tmpDir, ['2', 'current-dir-app'])
    await runNewCommand(deps)

    // No subdirectory was created — files landed directly in tmpDir.
    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8')) as { name: string }
    expect(pkg.name).toBe('current-dir-app')

    const meta = JSON.parse(readFileSync(join(tmpDir, 'prisma/admin-meta.json'), 'utf-8')) as Array<{
      name: string
    }>
    expect(meta.map((m) => m.name)).toEqual(expect.arrayContaining(['User', 'Session']))

    expect(execCalls.every((c) => c.cwd === tmpDir)).toBe(true)
  })
})

// ── Abort path ─────────────────────────────────────────────────────────────────

describe('hypersonic new — aborts without touching the filesystem', () => {
  it('does not generate or run setup when the user declines a non-empty target directory', async () => {
    const projectDir = join(tmpDir, 'my-app')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'existing-file.txt'), 'do not touch')

    const deps = makeRealDeps(tmpDir, ['1', 'my-app', 'n'])
    await runNewCommand(deps)

    // The pre-existing file is untouched and nothing from the template set
    // was written alongside it.
    expect(readFileSync(join(projectDir, 'existing-file.txt'), 'utf-8')).toBe('do not touch')
    expect(existsSync(join(projectDir, 'package.json'))).toBe(false)
    expect(execCalls).toEqual([])
  })
})