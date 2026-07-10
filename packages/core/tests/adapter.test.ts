import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as AdapterMod from '../src/database/adapter.js'

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a fresh PrismaPg mock constructor.
 * Called once per test so spy state is never shared between tests.
 */
function makePgMock() {
  return vi.fn().mockImplementation(function (opts: unknown) {
    return { _adapter: 'pg' as const, opts }
  })
}

/**
 * Creates a fresh PrismaBetterSqlite3 mock constructor.
 * Called once per test so spy state is never shared between tests.
 */
function makeSqliteMock() {
  return vi.fn().mockImplementation(function (opts: unknown) {
    return { _adapter: 'better-sqlite3' as const, opts }
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Wipe the module registry so each test receives a freshly-resolved SUT.
  vi.resetModules()
})

afterEach(() => {
  // Remove doMock registrations to prevent bleed-through into subsequent tests.
  vi.doUnmock('@prisma/adapter-pg')
  vi.doUnmock('@prisma/adapter-better-sqlite3')
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDatabaseAdapter', () => {
  // ── postgresql ──────────────────────────────────────────────────────────────

  describe('postgresql', () => {
    let PrismaPgMock: ReturnType<typeof makePgMock>
    // Definite assignment assertion: assigned in beforeEach before any test runs.
    let createDatabaseAdapter!: typeof AdapterMod.createDatabaseAdapter

    beforeEach(async () => {
      PrismaPgMock = makePgMock()
      vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: PrismaPgMock }))
      ;({ createDatabaseAdapter } = await import('../src/database/adapter.js'))
    })

    it('returns a PrismaPg instance', async () => {
      const adapter = await createDatabaseAdapter('postgresql', 'postgresql://localhost:5432/db')
      expect(adapter).toMatchObject({ _adapter: 'pg' })
    })

    it('passes connectionString to PrismaPg', async () => {
      await createDatabaseAdapter('postgresql', 'postgresql://localhost:5432/mydb')
      expect(PrismaPgMock).toHaveBeenCalledWith({ connectionString: 'postgresql://localhost:5432/mydb' })
    })

    it('also works with the postgres:// shorthand URL', async () => {
      await createDatabaseAdapter('postgresql', 'postgres://localhost/db')
      expect(PrismaPgMock).toHaveBeenCalledWith({ connectionString: 'postgres://localhost/db' })
    })
  })

  // ── sqlite ──────────────────────────────────────────────────────────────────

  describe('sqlite', () => {
    let PrismaBetterSqlite3Mock: ReturnType<typeof makeSqliteMock>
    // Definite assignment assertion: assigned in beforeEach before any test runs.
    let createDatabaseAdapter!: typeof AdapterMod.createDatabaseAdapter

    beforeEach(async () => {
      PrismaBetterSqlite3Mock = makeSqliteMock()
      vi.doMock('@prisma/adapter-better-sqlite3', () => ({ PrismaBetterSqlite3: PrismaBetterSqlite3Mock }))
      ;({ createDatabaseAdapter } = await import('../src/database/adapter.js'))
    })

    it('returns a PrismaBetterSqlite3 instance', async () => {
      const adapter = await createDatabaseAdapter('sqlite', 'file:./dev.db')
      expect(adapter).toMatchObject({ _adapter: 'better-sqlite3' })
    })

    it('passes url to PrismaBetterSqlite3', async () => {
      await createDatabaseAdapter('sqlite', 'file:./dev.db')
      expect(PrismaBetterSqlite3Mock).toHaveBeenCalledWith({ url: 'file:./dev.db' })
    })

    it('works with an absolute file path', async () => {
      await createDatabaseAdapter('sqlite', 'file:/absolute/path/db.sqlite')
      expect(PrismaBetterSqlite3Mock).toHaveBeenCalledWith({ url: 'file:/absolute/path/db.sqlite' })
    })
  })

  // ── provider isolation ──────────────────────────────────────────────────────
  //
  // These tests exercise the missing-driver contract: in a real install only
  // one optional adapter package is present. Each test registers the unused
  // adapter as a throwing factory — simulating the package not being installed
  // — and asserts the correct path still resolves successfully without ever
  // touching the absent package.

  describe('provider isolation', () => {
    it('postgresql path succeeds when the sqlite adapter package is absent', async () => {
      vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: makePgMock() }))
      // Simulate @prisma/adapter-better-sqlite3 not being installed.
      vi.doMock('@prisma/adapter-better-sqlite3', () => {
        throw new Error("Cannot find module '@prisma/adapter-better-sqlite3'")
      })
      const { createDatabaseAdapter } = await import('../src/database/adapter.js')
      await expect(
        createDatabaseAdapter('postgresql', 'postgresql://localhost/db'),
      ).resolves.toMatchObject({ _adapter: 'pg' })
    })

    it('sqlite path succeeds when the pg adapter package is absent', async () => {
      vi.doMock('@prisma/adapter-better-sqlite3', () => ({ PrismaBetterSqlite3: makeSqliteMock() }))
      // Simulate @prisma/adapter-pg not being installed.
      vi.doMock('@prisma/adapter-pg', () => {
        throw new Error("Cannot find module '@prisma/adapter-pg'")
      })
      const { createDatabaseAdapter } = await import('../src/database/adapter.js')
      await expect(
        createDatabaseAdapter('sqlite', 'file:./dev.db'),
      ).resolves.toMatchObject({ _adapter: 'better-sqlite3' })
    })
  })

  // ── unsupported provider ────────────────────────────────────────────────────

  describe('unsupported provider', () => {
    it('throws a descriptive error for a provider outside postgresql/sqlite', async () => {
      const { createDatabaseAdapter } = await import('../src/database/adapter.js')
      await expect(
        createDatabaseAdapter('mysql' as unknown as 'postgresql', 'mysql://localhost/db'),
      ).rejects.toThrowError(
        /unsupported database provider "mysql"\. Supported providers are: postgresql, sqlite\./,
      )
    })
  })
})