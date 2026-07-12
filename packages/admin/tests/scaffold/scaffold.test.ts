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
    expect(content).toContain('getSeconds()')
  })

  it('ModelForm template checks res.ok before parsing JSON in loadMore', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('if (!res.ok) throw new Error(')
  })

  it('ModelIndex template uses stable record id as row key', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('key={String(record[model.idField])}')
    expect(content).not.toContain('key={i}')
  })

  // ── Bug-fix assertions ────────────────────────────────────────────────────

  it('ModelForm template defines relatedModelSlug in FieldMeta interface', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('relatedModelSlug?: string')
  })

  it('ModelForm template imports useRef alongside useState', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('useRef')
  })

  it('ModelForm template uses a ref-based inflight guard in loadMore', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('inflight')
    expect(content).toContain('inflight.current.has(fieldName)')
    expect(content).toContain('inflight.current.add(fieldName)')
    expect(content).toContain('inflight.current.delete(fieldName)')
  })

  it('ModelForm template uses relatedModelSlug in the loadMore fetch URL', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('relatedModelSlug')
    expect(content).toContain('/related-options/${relatedModelSlug}')
  })

  it('ModelForm template does not derive the slug from relatedModelName client-side', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).not.toContain("charAt(0).toLowerCase()")
  })

  it('ModelForm template gates Boolean default on isRequired', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain("f.prismaType === 'Boolean' && f.isRequired")
  })

  it('ModelForm template gates enum default on isRequired', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain("f.kind === 'enum' && f.isRequired")
  })

  it('ModelIndex FieldMeta interface declares prismaType', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('prismaType: string')
  })

  it('ModelIndex displayValue accepts prismaType as second parameter', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('function displayValue(value: unknown, prismaType: string)')
  })

  it('ModelIndex displayValue branches on prismaType === DateTime', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain("prismaType === 'DateTime'")
  })

  it('ModelIndex displayValue formats DateTime values with toLocaleString', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('toLocaleString()')
  })

  it('ModelIndex cell rendering passes f.prismaType to displayValue', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('displayValue(record[field.name], field.prismaType)')
  })

  it('ModelIndex template does not use a regex for date detection', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).not.toContain('ISO_DATE_RE')
    expect(content).not.toContain('RegExp')
  })

  it('ModelIndex displayValue does not call toLocaleDateString (time would be stripped)', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).not.toContain('toLocaleDateString()')
  })

  // ── @admin.file fields ────────────────────────────────────────────────────

  it('ModelForm FieldKind includes "file"', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain("type FieldKind = 'scalar' | 'relation' | 'enum' | 'file'")
  })

  it('ModelForm FieldMeta declares filePublicField', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('filePublicField?: string')
  })

  it('ModelForm requests a presigned upload URL before uploading directly to S3', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('/files/${field.name}')
    expect(content).toContain("method: 'PUT'")
  })

  it('ModelForm stores the uploaded key via setData, not the raw File object', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('setData(field.name, key)')
  })

  it('ModelForm hides a file field\'s companion Boolean from the main render loop', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('hiddenFieldNames')
    expect(content).toContain('.filter((field) => !hiddenFieldNames.has(field.name))')
  })

  it('ModelForm does not spread stale defaults after prev/patch in updateFileUpload (TS2783 guard)', () => {
    // Regression guard: literal defaults must be computed into a separate
    // `current` binding, not spread inline alongside `...prev[fieldName]` in
    // the same object literal — the latter trips TS2783 ("specified more
    // than once") under strict mode.
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelForm.tsx'), 'utf-8')
    expect(content).toContain('const current: FileUploadState = prev[fieldName] ?? {')
  })

  it('ModelIndex FieldMeta declares kind', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain('kind: FieldKind')
  })

  it('ModelIndex renders a View link for file fields via the redirect route', () => {
    const content = readFileSync(join(TEMPLATES_DIR, 'ModelIndex.tsx'), 'utf-8')
    expect(content).toContain("field.kind === 'file'")
    expect(content).toContain('/files/${field.name}')
  })
})