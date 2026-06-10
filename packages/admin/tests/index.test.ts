import { describe, it, expect } from 'vitest'
import * as pkg from '../src/index.js'

describe('@hypersonic-js/admin public exports', () => {
  it('exports mountAdmin as a function', () => {
    expect(typeof pkg.mountAdmin).toBe('function')
  })

  it('exports scaffoldAdmin as a function', () => {
    expect(typeof pkg.scaffoldAdmin).toBe('function')
  })

  it('exports DEFAULT_HIDDEN_MODELS as a non-empty tuple', () => {
    expect(Array.isArray(pkg.DEFAULT_HIDDEN_MODELS)).toBe(true)
    expect(pkg.DEFAULT_HIDDEN_MODELS.length).toBeGreaterThan(0)
    expect(pkg.DEFAULT_HIDDEN_MODELS).toContain('Session')
  })

  it('exports DEFAULT_PREFIX as /admin', () => {
    expect(pkg.DEFAULT_PREFIX).toBe('/admin')
  })

  it('exports DEFAULT_PER_PAGE as a positive number', () => {
    expect(typeof pkg.DEFAULT_PER_PAGE).toBe('number')
    expect(pkg.DEFAULT_PER_PAGE).toBeGreaterThan(0)
  })

  it('exports MAX_RELATED_OPTIONS as a positive number', () => {
    expect(typeof pkg.MAX_RELATED_OPTIONS).toBe('number')
    expect(pkg.MAX_RELATED_OPTIONS).toBeGreaterThan(0)
  })
})