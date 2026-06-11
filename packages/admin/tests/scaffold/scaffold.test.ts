import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { scaffoldAdmin } from '../../src/scaffold/index.js'

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

// ── Temp directory setup ──────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'hypersonic-admin-scaffold-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scaffoldAdmin', () => {
  it('creates the Admin subdirectory when it does not exist', async () => {
    const targetDir = join(tmpDir, 'pages')
    await scaffoldAdmin({ targetDir })
    expect(existsSync(join(targetDir, 'Admin'))).toBe(true)
  })

  it('writes all four template files by default', async () => {
    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.written).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx', 'UserCreate.tsx'])
    expect(result.skipped).toEqual([])
  })

  it('writes the correct Dashboard.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const written = readFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'utf-8')
    const source = readFileSync(join(TEMPLATES_DIR, 'Dashboard.tsx'), 'utf-8')
    expect(written).toBe(source)
  })

  it('writes the correct ModelIndex.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const written = readFileSync(join(tmpDir, 'Admin', 'ModelIndex.tsx'), 'utf-8')
    const source = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(written).toBe(source)
  })

  it('writes the correct ModelForm.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const written = readFileSync(join(tmpDir, 'Admin', 'ModelForm.tsx'), 'utf-8')
    const source = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(written).toBe(source)
  })

  it('writes the correct UserCreate.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const written = readFileSync(join(tmpDir, 'Admin', 'UserCreate.tsx'), 'utf-8')
    const source = readFileSync(join(TEMPLATES_DIR, 'UserCreate.tsx'), 'utf-8')
    expect(written).toBe(source)
  })

  it('skips all files when they already exist and force is false', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const result = await scaffoldAdmin({ targetDir: tmpDir, force: false })
    expect(result.written).toEqual([])
    expect(result.skipped).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx', 'UserCreate.tsx'])
  })

  it('overwrites existing files when force is true', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    writeFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'stale content', 'utf-8')
    const result = await scaffoldAdmin({ targetDir: tmpDir, force: true })
    expect(result.written).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx', 'UserCreate.tsx'])
    expect(result.skipped).toEqual([])
    const written = readFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'utf-8')
    const source = readFileSync(join(TEMPLATES_DIR, 'Dashboard.tsx'), 'utf-8')
    expect(written).toBe(source)
  })

  it('skips existing files but writes new ones in a mixed scenario', async () => {
    const adminDir = join(tmpDir, 'Admin')
    await scaffoldAdmin({ targetDir: tmpDir })
    rmSync(join(adminDir, 'ModelIndex.tsx'))
    rmSync(join(adminDir, 'ModelForm.tsx'))

    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.skipped).toContain('Dashboard.tsx')
    expect(result.skipped).toContain('UserCreate.tsx')
    expect(result.written).toContain('ModelIndex.tsx')
    expect(result.written).toContain('ModelForm.tsx')
  })

  it('accepts no arguments and returns a ScaffoldResult (uses default targetDir)', async () => {
    const result = await scaffoldAdmin()
    expect(result).toHaveProperty('written')
    expect(result).toHaveProperty('skipped')
    expect(Array.isArray(result.written)).toBe(true)
    expect(Array.isArray(result.skipped)).toBe(true)
    rmSync('resources', { recursive: true, force: true })
  })

  it('uses the provided targetDir option', async () => {
    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.written).toHaveLength(4)
  })
})

// ── Template content sanity checks ───────────────────────────────────────────

describe('template content', () => {
  it('Dashboard template contains required React imports', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'Dashboard.tsx'), 'utf-8')
    expect(content).toContain("from '@inertiajs/react'")
    expect(content).toContain('export default function AdminDashboard')
  })

  it('ModelIndex template contains required React and Inertia imports', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain("from '@inertiajs/react'")
    expect(content).toContain('export default function AdminModelIndex')
  })

  it('ModelForm template contains useForm import', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('useForm')
    expect(content).toContain('export default function AdminModelForm')
  })

  it('UserCreate template contains useForm import', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'UserCreate.tsx'), 'utf-8')
    expect(content).toContain('useForm')
    expect(content).toContain('export default function AdminUserCreate')
  })

  it('UserCreate template renders name, email, password, and role fields', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'UserCreate.tsx'), 'utf-8')
    expect(content).toContain("type=\"text\"")
    expect(content).toContain("type=\"email\"")
    expect(content).toContain("type=\"password\"")
    expect(content).toContain("<select")
  })

  it('UserCreate template imports from @inertiajs/react', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'UserCreate.tsx'), 'utf-8')
    expect(content).toContain("from '@inertiajs/react'")
  })

  it('all templates are non-empty files', () => {
    const dashboard = readFileSync(join(TEMPLATES_DIR, 'Dashboard.tsx'), 'utf-8')
    const modelIndex = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    const modelForm = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    const userCreate = readFileSync(join(TEMPLATES_DIR, 'UserCreate.tsx'), 'utf-8')
    expect(dashboard.length).toBeGreaterThan(100)
    expect(modelIndex.length).toBeGreaterThan(100)
    expect(modelForm.length).toBeGreaterThan(100)
    expect(userCreate.length).toBeGreaterThan(100)
  })

  it('ModelForm template does not use toISOString().slice(0, 16)', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).not.toContain("toISOString().slice(0, 16)")
  })

  it('ModelForm template contains the toLocalDateTimeString helper', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('function toLocalDateTimeString(date: Date): string')
  })

  it('ModelForm template calls toLocalDateTimeString inside buildInitialData', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('toLocalDateTimeString(value)')
  })

  it('ModelForm toLocalDateTimeString reads local time components, not UTC', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('getFullYear()')
    expect(content).toContain('getMonth()')
    expect(content).toContain('getDate()')
    expect(content).toContain('getHours()')
    expect(content).toContain('getMinutes()')
  })
})