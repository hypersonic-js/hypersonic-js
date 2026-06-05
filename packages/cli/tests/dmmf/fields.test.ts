import { describe, it, expect } from 'vitest'
import {
  classifyField,
  isReadOnlyField,
  getDisplayField,
  getListFields,
  getFormFields,
  mapField,
} from '../../src/dmmf/fields.js'
import type { DmmfField, DmmfEnum } from '../../src/dmmf/types.js'
import type { AdminFieldMeta } from '@hypersonic-js/admin'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<DmmfField> = {}): DmmfField {
  return {
    name: 'title', type: 'String', kind: 'scalar',
    isRequired: true, isUnique: false, isId: false, isList: false,
    hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false,
    ...overrides,
  }
}

function makeAdminField(overrides: Partial<AdminFieldMeta> = {}): AdminFieldMeta {
  return {
    name: 'title', prismaType: 'String', kind: 'scalar',
    isRequired: true, isId: false, isUnique: false,
    hasDefault: false, isReadOnly: false, isList: false,
    ...overrides,
  }
}

const NO_ENUMS: DmmfEnum[] = []

// ── classifyField ─────────────────────────────────────────────────────────────

describe('classifyField', () => {
  it('returns scalar for scalar fields', () => {
    expect(classifyField(makeField({ kind: 'scalar' }))).toBe('scalar')
  })
  it('returns relation for object fields', () => {
    expect(classifyField(makeField({ kind: 'object' }))).toBe('relation')
  })
  it('returns enum for enum fields', () => {
    expect(classifyField(makeField({ kind: 'enum' }))).toBe('enum')
  })
  it('returns scalar for unsupported fields', () => {
    expect(classifyField(makeField({ kind: 'unsupported' }))).toBe('scalar')
  })
})

// ── isReadOnlyField ───────────────────────────────────────────────────────────

describe('isReadOnlyField', () => {
  it('returns true when Prisma marks the field isReadOnly (e.g. FK scalar)', () => {
    expect(isReadOnlyField(makeField({ name: 'userId', isReadOnly: true }))).toBe(true)
  })
  it('returns true for @updatedAt fields', () => {
    expect(isReadOnlyField(makeField({ isUpdatedAt: true }))).toBe(true)
  })
  it('returns true for fields named createdAt by convention', () => {
    expect(isReadOnlyField(makeField({ name: 'createdAt', isUpdatedAt: false }))).toBe(true)
  })
  it('returns true for fields named updatedAt by convention', () => {
    expect(isReadOnlyField(makeField({ name: 'updatedAt', isUpdatedAt: false }))).toBe(true)
  })
  it('returns false for a regular writable field', () => {
    expect(isReadOnlyField(makeField({ name: 'title' }))).toBe(false)
  })
})

// ── getDisplayField ───────────────────────────────────────────────────────────

describe('getDisplayField', () => {
  it('prefers name over other candidates', () => {
    const fields = [
      makeAdminField({ name: 'id', isId: true }),
      makeAdminField({ name: 'name' }),
      makeAdminField({ name: 'title' }),
    ]
    expect(getDisplayField(fields)).toBe('name')
  })
  it('falls back to title when name is absent', () => {
    expect(getDisplayField([makeAdminField({ name: 'id', isId: true }), makeAdminField({ name: 'title' })])).toBe('title')
  })
  it('falls back to email when name and title are absent', () => {
    expect(getDisplayField([makeAdminField({ name: 'id', isId: true }), makeAdminField({ name: 'email' })])).toBe('email')
  })
  it('falls back to label when higher priority candidates are absent', () => {
    expect(getDisplayField([makeAdminField({ name: 'id', isId: true }), makeAdminField({ name: 'label' })])).toBe('label')
  })
  it('falls back to slug when higher priority candidates are absent', () => {
    expect(getDisplayField([makeAdminField({ name: 'id', isId: true }), makeAdminField({ name: 'slug' })])).toBe('slug')
  })
  it('falls back to the id field when no candidate is found', () => {
    expect(getDisplayField([makeAdminField({ name: 'id', isId: true })])).toBe('id')
  })
  it('returns "id" when there are no fields at all', () => {
    expect(getDisplayField([])).toBe('id')
  })
  it('skips relation fields even if they match a candidate name', () => {
    const fields = [
      makeAdminField({ name: 'name', kind: 'relation' }),
      makeAdminField({ name: 'id', isId: true }),
      makeAdminField({ name: 'email', kind: 'scalar' }),
    ]
    expect(getDisplayField(fields)).toBe('email')
  })
})

// ── getListFields ─────────────────────────────────────────────────────────────

describe('getListFields', () => {
  it('returns only scalar non-list fields', () => {
    const fields = [
      makeAdminField({ name: 'id', kind: 'scalar' }),
      makeAdminField({ name: 'user', kind: 'relation' }),
      makeAdminField({ name: 'tags', kind: 'scalar', isList: true }),
    ]
    expect(getListFields(fields)).toHaveLength(1)
    expect(getListFields(fields)[0]!.name).toBe('id')
  })
  it('excludes known large text fields', () => {
    const fields = [
      makeAdminField({ name: 'id' }),
      ...['body','content','description','text','html','markdown'].map(n => makeAdminField({ name: n })),
    ]
    const result = getListFields(fields)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('id')
  })
  it('caps the result at 6 fields', () => {
    const fields = Array.from({ length: 10 }, (_, i) => makeAdminField({ name: `field${i}` }))
    expect(getListFields(fields)).toHaveLength(6)
  })
  it('returns an empty array when all fields are relations', () => {
    expect(getListFields([makeAdminField({ name: 'user', kind: 'relation' })])).toHaveLength(0)
  })
})

// ── getFormFields ─────────────────────────────────────────────────────────────

describe('getFormFields', () => {
  it('excludes relation fields', () => {
    const result = getFormFields([makeAdminField({ name: 'title' }), makeAdminField({ name: 'user', kind: 'relation' })])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('title')
  })
  it('excludes read-only fields', () => {
    const result = getFormFields([makeAdminField({ name: 'title' }), makeAdminField({ name: 'createdAt', isReadOnly: true })])
    expect(result).toHaveLength(1)
  })
  it('excludes FK scalar fields marked isReadOnly by Prisma', () => {
    const result = getFormFields([makeAdminField({ name: 'title' }), makeAdminField({ name: 'userId', isReadOnly: true })])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('title')
  })
  it('excludes id fields that have a default value', () => {
    const result = getFormFields([makeAdminField({ name: 'id', isId: true, hasDefault: true }), makeAdminField({ name: 'title' })])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('title')
  })
  it('includes id fields that do NOT have a default (user-provided ids)', () => {
    expect(getFormFields([makeAdminField({ name: 'id', isId: true, hasDefault: false }), makeAdminField({ name: 'title' })])).toHaveLength(2)
  })
  it('returns all editable fields when nothing is excluded', () => {
    expect(getFormFields([makeAdminField({ name: 'title' }), makeAdminField({ name: 'body' })])).toHaveLength(2)
  })
})

// ── mapField ──────────────────────────────────────────────────────────────────

describe('mapField', () => {
  it('maps a basic scalar string field', () => {
    const result = mapField(makeField({ name: 'title', type: 'String' }), NO_ENUMS)
    expect(result.name).toBe('title')
    expect(result.prismaType).toBe('String')
    expect(result.kind).toBe('scalar')
    expect(result.isRequired).toBe(true)
    expect(result.isId).toBe(false)
    expect(result.isUnique).toBe(false)
    expect(result.hasDefault).toBe(false)
    expect(result.isReadOnly).toBe(false)
    expect(result.isList).toBe(false)
    expect(result.relationTo).toBeUndefined()
    expect(result.enumValues).toBeUndefined()
  })
  it('maps an id field with auto-increment default', () => {
    const result = mapField(makeField({ name: 'id', type: 'Int', isId: true, hasDefaultValue: true }), NO_ENUMS)
    expect(result.isId).toBe(true)
    expect(result.hasDefault).toBe(true)
    expect(result.isReadOnly).toBe(false)
  })
  it('maps a FK scalar field as read-only via Prisma isReadOnly flag', () => {
    const result = mapField(makeField({ name: 'userId', type: 'String', isReadOnly: true }), NO_ENUMS)
    expect(result.isReadOnly).toBe(true)
  })
  it('maps a relation field and sets relationTo', () => {
    const result = mapField(makeField({ name: 'author', type: 'User', kind: 'object', isRequired: true }), NO_ENUMS)
    expect(result.kind).toBe('relation')
    expect(result.relationTo).toBe('User')
    expect(result.enumValues).toBeUndefined()
  })
  it('maps an enum field and resolves enumValues', () => {
    const enums: DmmfEnum[] = [{ name: 'Role', values: [{ name: 'ADMIN', dbName: null }, { name: 'USER', dbName: null }], dbName: null }]
    const result = mapField(makeField({ name: 'role', type: 'Role', kind: 'enum' }), enums)
    expect(result.kind).toBe('enum')
    expect(result.enumValues).toEqual(['ADMIN', 'USER'])
    expect(result.relationTo).toBeUndefined()
  })
  it('maps an enum field with no enumValues when enum is not found', () => {
    const result = mapField(makeField({ name: 'status', type: 'Status', kind: 'enum' }), NO_ENUMS)
    expect(result.kind).toBe('enum')
    expect(result.enumValues).toBeUndefined()
  })
  it('marks updatedAt as read-only via isUpdatedAt flag', () => {
    expect(mapField(makeField({ name: 'updatedAt', isUpdatedAt: true }), NO_ENUMS).isReadOnly).toBe(true)
  })
  it('marks createdAt as read-only by name convention', () => {
    expect(mapField(makeField({ name: 'createdAt' }), NO_ENUMS).isReadOnly).toBe(true)
  })
})