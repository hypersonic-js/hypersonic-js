import { describe, it, expect } from 'vitest'
import { detectProvider } from '../src/utils/detect-provider.js'

describe('detectProvider', () => {
  // ── known providers ──────────────────────────────────────────────────────

  it('detects postgresql:// URLs', () => {
    expect(detectProvider('postgresql://user:pass@localhost:5432/db')).toBe('postgresql')
  })

  it('detects postgres:// shorthand URLs', () => {
    expect(detectProvider('postgres://user:pass@localhost:5432/db')).toBe('postgresql')
  })

  it('detects mysql:// URLs', () => {
    expect(detectProvider('mysql://user:pass@localhost:3306/db')).toBe('mysql')
  })

  it('detects mysql2:// URLs', () => {
    expect(detectProvider('mysql2://user:pass@localhost:3306/db')).toBe('mysql')
  })

  it('detects mongodb:// URLs', () => {
    expect(detectProvider('mongodb://user:pass@localhost:27017/db')).toBe('mongodb')
  })

  it('detects mongodb+srv:// URLs', () => {
    expect(detectProvider('mongodb+srv://user:pass@cluster.mongodb.net/db')).toBe('mongodb')
  })

  // ── sqlite ───────────────────────────────────────────────────────────────

  it('detects file: SQLite URLs', () => {
    expect(detectProvider('file:./dev.db')).toBe('sqlite')
  })

  it('detects file: absolute SQLite paths', () => {
    expect(detectProvider('file:/absolute/path/db.sqlite')).toBe('sqlite')
  })

  it('detects file: in-memory SQLite URLs', () => {
    expect(detectProvider('file::memory:?cache=shared')).toBe('sqlite')
  })

  // ── error cases ──────────────────────────────────────────────────────────

  it('throws for a bare relative path', () => {
    expect(() => detectProvider('./relative/path.db')).toThrow(
      'unrecognised DATABASE_URL scheme',
    )
  })

  it('throws for a mistyped postgres scheme', () => {
    expect(() => detectProvider('postgresqll://user:pass@localhost/db')).toThrow(
      'unrecognised DATABASE_URL scheme',
    )
  })

  it('throws for an entirely unknown scheme', () => {
    expect(() => detectProvider('redis://localhost:6379')).toThrow(
      'unrecognised DATABASE_URL scheme',
    )
  })

  it('throws for an empty string', () => {
    expect(() => detectProvider('')).toThrow('unrecognised DATABASE_URL scheme')
  })

  it('throws for a plain word with no scheme', () => {
    expect(() => detectProvider('not-a-url')).toThrow('unrecognised DATABASE_URL scheme')
  })

  it('error message does not include the database URL', () => {
    const url = 'badscheme://user:password@localhost/db'
    expect(() => detectProvider(url)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(url) }),
    )
  })
})