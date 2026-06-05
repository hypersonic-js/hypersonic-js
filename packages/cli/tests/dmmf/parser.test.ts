import { describe, it, expect } from 'vitest'
import { toDisplayName, parseDmmf } from '../../src/dmmf/parser.js'
import type { DmmfDocument } from '../../src/dmmf/types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMinimalDmmf(overrides: Partial<DmmfDocument['datamodel']> = {}): DmmfDocument {
  return {
    datamodel: {
      models: [
        {
          name: 'Post',
          dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
          ],
        },
      ],
      enums: [],
      ...overrides,
    },
  }
}

// ── toDisplayName ─────────────────────────────────────────────────────────────

describe('toDisplayName', () => {
  it('returns the name unchanged when it already ends with s', () => {
    expect(toDisplayName('Posts')).toBe('Posts')
    expect(toDisplayName('Status')).toBe('Status')
  })
  it('converts y to ies when y is not preceded by a vowel', () => {
    expect(toDisplayName('Category')).toBe('Categories')
    expect(toDisplayName('Reply')).toBe('Replies')
  })
  it('does not convert vowel+y endings to ies', () => {
    expect(toDisplayName('Holiday')).toBe('Holidays')
    expect(toDisplayName('Monkey')).toBe('Monkeys')
  })
  it('adds s for regular nouns', () => {
    expect(toDisplayName('Post')).toBe('Posts')
    expect(toDisplayName('User')).toBe('Users')
    expect(toDisplayName('Comment')).toBe('Comments')
  })
})

// ── parseDmmf ─────────────────────────────────────────────────────────────────

describe('parseDmmf', () => {
  it('returns one AdminModelMeta per model', () => {
    const result = parseDmmf(makeMinimalDmmf())
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Post')
  })

  it('sets correct urlSlug and displayName', () => {
    const result = parseDmmf(makeMinimalDmmf())
    expect(result[0]!.urlSlug).toBe('post')
    expect(result[0]!.displayName).toBe('Posts')
  })

  it('identifies the id field and its type as number for Int', () => {
    const result = parseDmmf(makeMinimalDmmf())
    expect(result[0]!.idField).toBe('id')
    expect(result[0]!.idType).toBe('number')
  })

  it('identifies idType as string for String id fields', () => {
    const dmmf = makeMinimalDmmf({
      models: [{
        name: 'User', dbName: null,
        fields: [{ name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false }],
      }],
      enums: [],
    })
    expect(parseDmmf(dmmf)[0]!.idType).toBe('string')
  })

  it('identifies idType as number for Float id fields', () => {
    const dmmf = makeMinimalDmmf({
      models: [{
        name: 'Metric', dbName: null,
        fields: [{ name: 'id', type: 'Float', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false }],
      }],
      enums: [],
    })
    expect(parseDmmf(dmmf)[0]!.idType).toBe('number')
  })

  it('sets displayField to title when present', () => {
    const result = parseDmmf(makeMinimalDmmf())
    expect(result[0]!.displayField).toBe('title')
  })

  it('excludes auto-id and relation fields from formFields', () => {
    const result = parseDmmf(makeMinimalDmmf())
    const formFields = result[0]!.formFields
    expect(formFields.every((f) => !f.isId || !f.hasDefault)).toBe(true)
    expect(formFields.every((f) => f.kind !== 'relation')).toBe(true)
  })

  it('falls back to first field when no field is marked isId', () => {
    const dmmf = makeMinimalDmmf({
      models: [{
        name: 'Thing', dbName: null,
        fields: [
          { name: 'slug', type: 'String', kind: 'scalar', isRequired: true, isUnique: true, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
          { name: 'label', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
        ],
      }],
      enums: [],
    })
    const result = parseDmmf(dmmf)
    expect(result[0]!.idField).toBe('slug')
  })

  it('throws when a model has no fields at all', () => {
    const dmmf = makeMinimalDmmf({ models: [{ name: 'Empty', dbName: null, fields: [] }], enums: [] })
    expect(() => parseDmmf(dmmf)).toThrow('Admin: model "Empty" has no fields')
  })

  it('includes all models without filtering', () => {
    const dmmf = makeMinimalDmmf({
      models: [
        { name: 'Post', dbName: null, fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false }] },
        { name: 'Session', dbName: null, fields: [{ name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false }] },
      ],
      enums: [],
    })
    expect(parseDmmf(dmmf)).toHaveLength(2)
  })
})