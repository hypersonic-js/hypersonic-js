import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scaffoldAdmin } from '../../src/scaffold/index.js'
import {
  DASHBOARD_TEMPLATE,
  MODEL_INDEX_TEMPLATE,
  MODEL_FORM_TEMPLATE,
} from '../../src/scaffold/templates.js'

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

  it('writes all three template files by default', async () => {
    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.written).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'])
    expect(result.skipped).toEqual([])
  })

  it('writes the correct Dashboard.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const content = readFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'utf-8')
    expect(content).toBe(DASHBOARD_TEMPLATE)
  })

  it('writes the correct ModelIndex.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const content = readFileSync(join(tmpDir, 'Admin', 'ModelIndex.tsx'), 'utf-8')
    expect(content).toBe(MODEL_INDEX_TEMPLATE)
  })

  it('writes the correct ModelForm.tsx content', async () => {
    await scaffoldAdmin({ targetDir: tmpDir })
    const content = readFileSync(join(tmpDir, 'Admin', 'ModelForm.tsx'), 'utf-8')
    expect(content).toBe(MODEL_FORM_TEMPLATE)
  })

  it('skips all files when they already exist and force is false', async () => {
    // Write once
    await scaffoldAdmin({ targetDir: tmpDir })
    // Write again
    const result = await scaffoldAdmin({ targetDir: tmpDir, force: false })
    expect(result.written).toEqual([])
    expect(result.skipped).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'])
  })

  it('overwrites existing files when force is true', async () => {
    // Write initial files
    await scaffoldAdmin({ targetDir: tmpDir })
    // Corrupt one file to verify it gets replaced
    writeFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'stale content', 'utf-8')
    // Overwrite with force
    const result = await scaffoldAdmin({ targetDir: tmpDir, force: true })
    expect(result.written).toEqual(['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'])
    expect(result.skipped).toEqual([])
    const content = readFileSync(join(tmpDir, 'Admin', 'Dashboard.tsx'), 'utf-8')
    expect(content).toBe(DASHBOARD_TEMPLATE)
  })

  it('skips existing files but writes new ones in a mixed scenario', async () => {
    // Pre-create only Dashboard
    const adminDir = join(tmpDir, 'Admin')
    await scaffoldAdmin({ targetDir: tmpDir })
    rmSync(join(adminDir, 'ModelIndex.tsx'))
    rmSync(join(adminDir, 'ModelForm.tsx'))

    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.skipped).toContain('Dashboard.tsx')
    expect(result.written).toContain('ModelIndex.tsx')
    expect(result.written).toContain('ModelForm.tsx')
  })

  it('accepts no arguments and returns a ScaffoldResult (uses default targetDir)', async () => {
    // scaffoldAdmin() defaults to 'resources/js/Pages'; mkdirSync recursive
    // creates all parent directories, so this must not throw.
    const result = await scaffoldAdmin()
    expect(result).toHaveProperty('written')
    expect(result).toHaveProperty('skipped')
    expect(Array.isArray(result.written)).toBe(true)
    expect(Array.isArray(result.skipped)).toBe(true)
    // Clean up the created default directory
    rmSync('resources', { recursive: true, force: true })
  })

  it('uses the provided targetDir option', async () => {
    const result = await scaffoldAdmin({ targetDir: tmpDir })
    expect(result.written).toHaveLength(3)
  })
})

// ── Template content sanity checks ───────────────────────────────────────────

describe('template content', () => {
  it('Dashboard template contains required React imports', () => {
    expect(DASHBOARD_TEMPLATE).toContain("from '@inertiajs/react'")
    expect(DASHBOARD_TEMPLATE).toContain('export default function AdminDashboard')
  })

  it('ModelIndex template contains required React and Inertia imports', () => {
    expect(MODEL_INDEX_TEMPLATE).toContain("from '@inertiajs/react'")
    expect(MODEL_INDEX_TEMPLATE).toContain('export default function AdminModelIndex')
  })

  it('ModelForm template contains useForm import', () => {
    expect(MODEL_FORM_TEMPLATE).toContain('useForm')
    expect(MODEL_FORM_TEMPLATE).toContain('export default function AdminModelForm')
  })

  it('all templates are non-empty strings', () => {
    expect(DASHBOARD_TEMPLATE.length).toBeGreaterThan(100)
    expect(MODEL_INDEX_TEMPLATE.length).toBeGreaterThan(100)
    expect(MODEL_FORM_TEMPLATE.length).toBeGreaterThan(100)
  })
})
