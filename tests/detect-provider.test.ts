import { describe, it, expect } from 'vitest'
import { detectProvider } from '../src/utils/detect-provider.js'

describe('detectProvider', () => {
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

  it('defaults to sqlite for file paths', () => {
    expect(detectProvider('file:./dev.db')).toBe('sqlite')
  })

  it('defaults to sqlite for unknown schemes', () => {
    expect(detectProvider('./relative/path.db')).toBe('sqlite')
  })
})
