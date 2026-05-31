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
} from '../../src/crud/query.js'
import type { AdminModelMeta, PrismaClientLike } from '../../src/types.js'

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
      { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
      { name: 'published', prismaType: 'Boolean', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
      { name: 'score', prismaType: 'Int', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
      { name: 'weight', prismaType: 'Float', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
      { name: 'publishedAt', prismaType: 'DateTime', kind: 'scalar', isRequired: false, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
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
})
