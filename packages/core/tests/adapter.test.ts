import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the driver adapter packages — they are not installed as project deps;
// the user installs whichever one matches their database.
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn().mockImplementation(function (opts: unknown) {
    return { _adapter: 'pg', opts }
  }),
}))

vi.mock('@prisma/adapter-better-sqlite3', () => ({
  PrismaBetterSqlite3: vi.fn().mockImplementation(function (opts: unknown) {
    return { _adapter: 'better-sqlite3', opts }
  }),
}))

import { createDatabaseAdapter } from '../src/database/adapter.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createDatabaseAdapter', () => {
  describe('postgresql', () => {
    it('returns a PrismaPg instance', async () => {
      const adapter = await createDatabaseAdapter('postgresql', 'postgresql://localhost:5432/db')
      expect(adapter).toMatchObject({ _adapter: 'pg' })
    })

    it('passes connectionString to PrismaPg', async () => {
      await createDatabaseAdapter('postgresql', 'postgresql://localhost:5432/mydb')
      expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://localhost:5432/mydb' })
    })

    it('also works with the postgres:// shorthand URL', async () => {
      await createDatabaseAdapter('postgresql', 'postgres://localhost/db')
      expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgres://localhost/db' })
    })
  })

  describe('sqlite', () => {
    it('returns a PrismaBetterSqlite3 instance', async () => {
      const adapter = await createDatabaseAdapter('sqlite', 'file:./dev.db')
      expect(adapter).toMatchObject({ _adapter: 'better-sqlite3' })
    })

    it('passes url to PrismaBetterSqlite3', async () => {
      await createDatabaseAdapter('sqlite', 'file:./dev.db')
      expect(PrismaBetterSqlite3).toHaveBeenCalledWith({ url: 'file:./dev.db' })
    })

    it('works with an absolute file path', async () => {
      await createDatabaseAdapter('sqlite', 'file:/absolute/path/db.sqlite')
      expect(PrismaBetterSqlite3).toHaveBeenCalledWith({ url: 'file:/absolute/path/db.sqlite' })
    })
  })

  describe('provider isolation', () => {
    it('postgresql does not import the sqlite adapter', async () => {
      await createDatabaseAdapter('postgresql', 'postgresql://localhost/db')
      expect(PrismaBetterSqlite3).not.toHaveBeenCalled()
    })

    it('sqlite does not import the pg adapter', async () => {
      await createDatabaseAdapter('sqlite', 'file:./dev.db')
      expect(PrismaPg).not.toHaveBeenCalled()
    })
  })
})