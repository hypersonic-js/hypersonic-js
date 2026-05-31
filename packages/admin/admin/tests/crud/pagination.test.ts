import { describe, it, expect } from 'vitest'
import { parsePaginationParams, buildPaginationMeta } from '../../src/crud/pagination.js'
import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from '../../src/constants.js'

describe('parsePaginationParams', () => {
  it('returns defaults when query is empty', () => {
    const result = parsePaginationParams({})
    expect(result.page).toBe(1)
    expect(result.perPage).toBe(DEFAULT_PER_PAGE)
    expect(result.skip).toBe(0)
    expect(result.take).toBe(DEFAULT_PER_PAGE)
  })

  it('parses valid page and perPage values', () => {
    const result = parsePaginationParams({ page: '3', perPage: '10' })
    expect(result.page).toBe(3)
    expect(result.perPage).toBe(10)
    expect(result.skip).toBe(20)
    expect(result.take).toBe(10)
  })

  it('calculates skip correctly for page 2', () => {
    const result = parsePaginationParams({ page: '2', perPage: '25' })
    expect(result.skip).toBe(25)
    expect(result.take).toBe(25)
  })

  it('clamps page to 1 when page is 0', () => {
    const result = parsePaginationParams({ page: '0' })
    expect(result.page).toBe(1)
  })

  it('clamps page to 1 when page is negative', () => {
    const result = parsePaginationParams({ page: '-5' })
    expect(result.page).toBe(1)
  })

  it('clamps perPage to MAX_PER_PAGE when value exceeds limit', () => {
    const result = parsePaginationParams({ perPage: '500' })
    expect(result.perPage).toBe(MAX_PER_PAGE)
    expect(result.take).toBe(MAX_PER_PAGE)
  })

  it('clamps perPage to 1 when value is 0', () => {
    const result = parsePaginationParams({ perPage: '0' })
    expect(result.perPage).toBe(DEFAULT_PER_PAGE)
  })

  it('uses defaults for non-numeric page', () => {
    const result = parsePaginationParams({ page: 'abc' })
    expect(result.page).toBe(1)
  })

  it('uses defaults for non-numeric perPage', () => {
    const result = parsePaginationParams({ perPage: 'abc' })
    expect(result.perPage).toBe(DEFAULT_PER_PAGE)
  })

  it('floors decimal page values', () => {
    const result = parsePaginationParams({ page: '2.9' })
    expect(result.page).toBe(2)
  })

  it('floors decimal perPage values', () => {
    const result = parsePaginationParams({ perPage: '15.7' })
    expect(result.perPage).toBe(15)
  })

  it('handles numeric (non-string) values', () => {
    const result = parsePaginationParams({ page: 2, perPage: 10 })
    expect(result.page).toBe(2)
    expect(result.perPage).toBe(10)
  })
})

describe('buildPaginationMeta', () => {
  it('builds correct meta for a normal page', () => {
    const result = buildPaginationMeta(1, 20, 45)
    expect(result.page).toBe(1)
    expect(result.perPage).toBe(20)
    expect(result.total).toBe(45)
    expect(result.totalPages).toBe(3)
  })

  it('returns 0 totalPages when total is 0', () => {
    const result = buildPaginationMeta(1, 20, 0)
    expect(result.totalPages).toBe(0)
    expect(result.total).toBe(0)
  })

  it('returns 1 totalPage when total equals perPage', () => {
    const result = buildPaginationMeta(1, 20, 20)
    expect(result.totalPages).toBe(1)
  })

  it('rounds up for partial last page', () => {
    const result = buildPaginationMeta(1, 20, 21)
    expect(result.totalPages).toBe(2)
  })

  it('returns 1 totalPage when total is less than perPage', () => {
    const result = buildPaginationMeta(1, 20, 5)
    expect(result.totalPages).toBe(1)
  })
})
