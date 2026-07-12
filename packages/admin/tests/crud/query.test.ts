import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDelegate,
  coerceData,
  findMany,
  countRecords,
  findUnique,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchRelatedOptions,
} from '../../src/crud/query.js'
import type { AdminModelMeta, PrismaClientLike } from '../../src/types.js'
import { MAX_RELATED_OPTIONS } from '../../src/constants.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Test' }]),
    findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Test' }),
    create: vi.fn().mockResolvedValue({ id: 1, title: 'Created' }),
    update: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
    delete: vi.fn().mockResolvedValue({ id: 1 }),
    count: vi.fn().mockResolvedValue(5),
  }
}

function makePrisma(delegateName = 'post') {
  const delegate = makeDelegate()
  return { prisma: { $disconnect: vi.fn(), [delegateName]: delegate } as unknown as PrismaClientLike, delegate }
}

function makeModel(overrides: Partial<AdminModelMeta> = {}): AdminModelMeta {
  return {
    name: 'Post',
    urlSlug: 'post',
    displayName: 'Posts',
    idField: 'id',
    idType: 'number',
    displayField: 'title',
    fields: [],
    listFields: [],
    formFields: [
      { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
      { name: 'published', prismaType: 'Boolean', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
      { name: 'score', prismaType: 'Int', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
      { name: 'weight', prismaType: 'Float', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
      { name: 'publishedAt', prismaType: 'DateTime', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
    ],
    ...overrides,
  }
}

// ── getDelegate ───────────────────────────────────────────────────────────────

describe('getDelegate', () => {
  it('finds the delegate by camelCase model name', () => {
    const { prisma, delegate } = makePrisma('post')
    expect(getDelegate(prisma, 'Post')).toBe(delegate)
  })

  it('handles already-lowercase model names', () => {
    const { prisma, delegate } = makePrisma('user')
    expect(getDelegate(prisma, 'user')).toBe(delegate)
  })

  it('throws a descriptive error when the delegate is not found', () => {
    const { prisma } = makePrisma('post')
    expect(() => getDelegate(prisma, 'NonExistent')).toThrow(/NonExistent/)
  })

  it('throws when the delegate slot is null', () => {
    const prisma = { $disconnect: vi.fn(), post: null } as unknown as PrismaClientLike
    expect(() => getDelegate(prisma, 'Post')).toThrow(/Post/)
  })
})

// ── coerceData ────────────────────────────────────────────────────────────────

describe('coerceData', () => {
  const model = makeModel()

  it('passes string values through unchanged', () => {
    expect(coerceData({ title: 'Hello' }, model)).toEqual({ title: 'Hello' })
  })

  it('converts string "true" to boolean true', () => {
    expect(coerceData({ published: 'true' }, model)).toEqual({ published: true })
  })

  it('converts boolean true to boolean true', () => {
    expect(coerceData({ published: true }, model)).toEqual({ published: true })
  })

  it('converts string "false" to boolean false', () => {
    expect(coerceData({ published: 'false' }, model)).toEqual({ published: false })
  })

  it('converts Int string to number', () => {
    expect(coerceData({ score: '42' }, model)).toEqual({ score: 42 })
  })

  it('converts Float string to number', () => {
    expect(coerceData({ weight: '3.14' }, model)).toEqual({ weight: 3.14 })
  })

  it('converts DateTime string to a Date object', () => {
    const result = coerceData({ publishedAt: '2024-01-15T10:30:00.000Z' }, model)
    expect(result['publishedAt']).toBeInstanceOf(Date)
  })

  it('sets optional empty string to null', () => {
    expect(coerceData({ score: '' }, model)).toEqual({ score: null })
  })

  it('sets optional null value to null', () => {
    expect(coerceData({ score: null }, model)).toEqual({ score: null })
  })

  it('sets required empty string to undefined (let Prisma validate)', () => {
    expect(coerceData({ title: '' }, model)).toEqual({ title: undefined })
  })

  it('skips fields not present in formFields (mass-assignment protection)', () => {
    expect(coerceData({ secret: 'hack' }, model)).toEqual({})
  })

  it('handles undefined values the same as null for optional fields', () => {
    expect(coerceData({ score: undefined }, model)).toEqual({ score: null })
  })
})

// ── fetchRelatedOptions ───────────────────────────────────────────────────────

describe('fetchRelatedOptions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls findMany with take and skip=0 and returns id/label pairs', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([
      { id: 'u1', name: 'Alice' },
      { id: 'u2', name: 'Bob' },
    ])
    const userModel = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'name' })
    const result = await fetchRelatedOptions(prisma, userModel)
    expect(delegate.findMany).toHaveBeenCalledWith({ take: MAX_RELATED_OPTIONS, skip: 0 })
    expect(result).toEqual([
      { id: 'u1', label: 'Alice' },
      { id: 'u2', label: 'Bob' },
    ])
  })

  it('passes skip when fetching subsequent pages', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([{ id: 'u101', name: 'Charlie' }])
    const model = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'name' })
    await fetchRelatedOptions(prisma, model, MAX_RELATED_OPTIONS)
    expect(delegate.findMany).toHaveBeenCalledWith({ take: MAX_RELATED_OPTIONS, skip: MAX_RELATED_OPTIONS })
  })

  it('uses displayField for the label', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([{ id: 1, email: 'a@b.com', name: 'Alice' }])
    const model = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'email' })
    const result = await fetchRelatedOptions(prisma, model)
    expect(result[0]!.label).toBe('a@b.com')
  })

  it('falls back to idField when displayField is missing from record', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([{ id: 42 }])
    const model = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'name' })
    const result = await fetchRelatedOptions(prisma, model)
    expect(result[0]!.label).toBe('42')
  })

  it('returns an empty array when there are no records', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([])
    const model = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'name' })
    expect(await fetchRelatedOptions(prisma, model)).toEqual([])
  })

  it('falls back to an empty string when both displayField and idField are missing from the record', async () => {
    const { prisma, delegate } = makePrisma('user')
    delegate.findMany.mockResolvedValue([{ other: 'value' }])
    const model = makeModel({ name: 'User', urlSlug: 'user', idField: 'id', displayField: 'name' })
    const result = await fetchRelatedOptions(prisma, model)
    expect(result[0]!.label).toBe('')
  })
})

// ── findMany ──────────────────────────────────────────────────────────────────

describe('findMany', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls findMany and count in parallel', async () => {
    const { prisma, delegate } = makePrisma()
    const model = makeModel()
    await findMany(prisma, model, { skip: 0, take: 20 })
    expect(delegate.findMany).toHaveBeenCalledWith({ skip: 0, take: 20 })
    expect(delegate.count).toHaveBeenCalledWith({})
  })

  it('returns records and total', async () => {
    const { prisma } = makePrisma()
    const result = await findMany(prisma, makeModel(), { skip: 0, take: 20 })
    expect(result.records).toHaveLength(1)
    expect(result.total).toBe(5)
  })
})

// ── countRecords ──────────────────────────────────────────────────────────────

describe('countRecords', () => {
  it('calls count with empty args and returns the total', async () => {
    const { prisma, delegate } = makePrisma()
    const count = await countRecords(prisma, makeModel())
    expect(delegate.count).toHaveBeenCalledWith({})
    expect(count).toBe(5)
  })
})

// ── findUnique ────────────────────────────────────────────────────────────────

describe('findUnique', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queries with numeric id when idType is number', async () => {
    const { prisma, delegate } = makePrisma()
    await findUnique(prisma, makeModel({ idType: 'number' }), '42')
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: 42 } })
  })

  it('queries with string id when idType is string', async () => {
    const { prisma, delegate } = makePrisma('user')
    await findUnique(prisma, makeModel({ name: 'User', urlSlug: 'user', idType: 'string' }), 'abc-123')
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { id: 'abc-123' } })
  })

  it('returns the record from the delegate', async () => {
    const { prisma } = makePrisma()
    const result = await findUnique(prisma, makeModel(), '1')
    expect(result).toEqual({ id: 1, title: 'Test' })
  })

  it('returns null without calling the delegate for a non-numeric id on a number model', async () => {
    const { prisma, delegate } = makePrisma()
    const result = await findUnique(prisma, makeModel({ idType: 'number' }), 'abc')
    expect(result).toBeNull()
    expect(delegate.findUnique).not.toHaveBeenCalled()
  })
})

// ── createRecord ──────────────────────────────────────────────────────────────

describe('createRecord', () => {
  it('creates a record with coerced data', async () => {
    const { prisma, delegate } = makePrisma()
    await createRecord(prisma, makeModel(), { title: 'New Post', score: '5' })
    expect(delegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: 'New Post', score: 5 }),
    })
  })

  it('returns the created record', async () => {
    const { prisma } = makePrisma()
    const result = await createRecord(prisma, makeModel(), { title: 'New Post' })
    expect(result).toEqual({ id: 1, title: 'Created' })
  })
})

// ── updateRecord ──────────────────────────────────────────────────────────────

describe('updateRecord', () => {
  it('updates with numeric where clause for number id', async () => {
    const { prisma, delegate } = makePrisma()
    await updateRecord(prisma, makeModel(), '7', { title: 'Updated' })
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ title: 'Updated' }),
    })
  })

  it('updates with string where clause for string id', async () => {
    const { prisma, delegate } = makePrisma('user')
    await updateRecord(
      prisma,
      makeModel({ name: 'User', urlSlug: 'user', idType: 'string' }),
      'abc',
      { title: 'Updated' },
    )
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: 'abc' },
      data: expect.any(Object),
    })
  })

  it('returns null without calling the delegate for a non-numeric id on a number model', async () => {
    const { prisma, delegate } = makePrisma()
    const result = await updateRecord(prisma, makeModel({ idType: 'number' }), 'abc', { title: 'x' })
    expect(result).toBeNull()
    expect(delegate.update).not.toHaveBeenCalled()
  })
})

// ── deleteRecord ──────────────────────────────────────────────────────────────

describe('deleteRecord', () => {
  it('deletes with numeric where clause', async () => {
    const { prisma, delegate } = makePrisma()
    await deleteRecord(prisma, makeModel(), '99')
    expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 99 } })
  })

  it('deletes with string where clause', async () => {
    const { prisma, delegate } = makePrisma('user')
    await deleteRecord(prisma, makeModel({ name: 'User', urlSlug: 'user', idType: 'string' }), 'xyz')
    expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 'xyz' } })
  })

  it('returns without calling the delegate for a non-numeric id on a number model', async () => {
    const { prisma, delegate } = makePrisma()
    await deleteRecord(prisma, makeModel({ idType: 'number' }), 'abc')
    expect(delegate.delete).not.toHaveBeenCalled()
  })
})