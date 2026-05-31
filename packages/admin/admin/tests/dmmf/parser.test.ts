import { describe, it, expect } from 'vitest'
import { parseDmmf, toDisplayName } from '../../src/dmmf/parser.js'
import type { DmmfDocument } from '../../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeScalarField(name: string, type = 'String', extra = {}) {
  return {
    name,
    type,
    kind: 'scalar' as const,
    isRequired: true,
    isUnique: false,
    isId: false,
    isList: false,
    hasDefaultValue: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    ...extra,
  }
}

function makeDmmf(modelNames: string[]): DmmfDocument {
  return {
    datamodel: {
      models: modelNames.map((name) => ({
        name,
        dbName: null,
        fields: [
          makeScalarField('id', 'String', { isId: true }),
          makeScalarField('email'),
          makeScalarField('createdAt', 'DateTime'),
        ],
      })),
      enums: [],
    },
  }
}

const FULL_DMMF: DmmfDocument = {
  datamodel: {
    models: [
      {
        name: 'User',
        dbName: null,
        fields: [
          makeScalarField('id', 'String', { isId: true }),
          makeScalarField('email', 'String', { isUnique: true }),
          makeScalarField('name'),
          makeScalarField('createdAt', 'DateTime'),
        ],
      },
      {
        name: 'Post',
        dbName: null,
        fields: [
          makeScalarField('id', 'Int', { isId: true, hasDefaultValue: true }),
          makeScalarField('title'),
          makeScalarField('body'),
          makeScalarField('userId'),
          { ...makeScalarField('user', 'User'), kind: 'object' as const },
        ],
      },
      { name: 'Session', dbName: null, fields: [makeScalarField('id', 'String', { isId: true })] },
      { name: 'Account', dbName: null, fields: [makeScalarField('id', 'String', { isId: true })] },
      { name: 'Verification', dbName: null, fields: [makeScalarField('id', 'String', { isId: true })] },
    ],
    enums: [],
  },
}

// ── toDisplayName ─────────────────────────────────────────────────────────────

describe('toDisplayName', () => {
  it('adds s for regular words', () => {
    expect(toDisplayName('Post')).toBe('Posts')
  })

  it('does not add s when name already ends in s', () => {
    expect(toDisplayName('Status')).toBe('Status')
  })

  it('converts y to ies when preceded by a consonant', () => {
    expect(toDisplayName('Category')).toBe('Categories')
  })

  it('adds s when y is preceded by a vowel', () => {
    expect(toDisplayName('Key')).toBe('Keys')
  })

  it('handles User correctly', () => {
    expect(toDisplayName('User')).toBe('Users')
  })
})

// ── parseDmmf ─────────────────────────────────────────────────────────────────

describe('parseDmmf', () => {
  describe('hidden model filtering', () => {
    it('hides Session, Account, and Verification by default', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const names = models.map((m) => m.name)
      expect(names).not.toContain('Session')
      expect(names).not.toContain('Account')
      expect(names).not.toContain('Verification')
    })

    it('shows all models when showAuthModels is true', () => {
      const models = parseDmmf(FULL_DMMF, { showAuthModels: true })
      const names = models.map((m) => m.name)
      expect(names).toContain('Session')
      expect(names).toContain('Account')
      expect(names).toContain('Verification')
    })

    it('hides additional models specified in hiddenModels', () => {
      const models = parseDmmf(FULL_DMMF, { hiddenModels: ['Post'] })
      const names = models.map((m) => m.name)
      expect(names).not.toContain('Post')
      expect(names).toContain('User')
    })

    it('can combine showAuthModels and hiddenModels', () => {
      const models = parseDmmf(FULL_DMMF, { showAuthModels: true, hiddenModels: ['User'] })
      const names = models.map((m) => m.name)
      expect(names).toContain('Session')
      expect(names).not.toContain('User')
    })
  })

  describe('model metadata', () => {
    it('sets name and urlSlug correctly', () => {
      const models = parseDmmf(makeDmmf(['Post']), {})
      expect(models[0]!.name).toBe('Post')
      expect(models[0]!.urlSlug).toBe('post')
    })

    it('sets displayName using toDisplayName', () => {
      const models = parseDmmf(makeDmmf(['Category']), {})
      expect(models[0]!.displayName).toBe('Categories')
    })

    it('detects string idType for String ids', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const user = models.find((m) => m.name === 'User')!
      expect(user.idType).toBe('string')
    })

    it('detects number idType for Int ids', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const post = models.find((m) => m.name === 'Post')!
      expect(post.idType).toBe('number')
    })

    it('detects the correct idField name', () => {
      const models = parseDmmf(FULL_DMMF, {})
      expect(models[0]!.idField).toBe('id')
    })

    it('uses the first field as id when no @id field exists', () => {
      const dmmf: DmmfDocument = {
        datamodel: {
          models: [{
            name: 'Weird',
            dbName: null,
            fields: [makeScalarField('code', 'String')],
          }],
          enums: [],
        },
      }
      const models = parseDmmf(dmmf, {})
      expect(models[0]!.idField).toBe('code')
    })

    it('throws when a model has no fields at all', () => {
      const dmmf: DmmfDocument = {
        datamodel: {
          models: [{ name: 'Empty', dbName: null, fields: [] }],
          enums: [],
        },
      }
      expect(() => parseDmmf(dmmf, {})).toThrow(/model "Empty" has no fields/)
    })

    it('selects the correct displayField (prefers name)', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const user = models.find((m) => m.name === 'User')!
      expect(user.displayField).toBe('name')
    })

    it('populates fields array with all model fields', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const user = models.find((m) => m.name === 'User')!
      expect(user.fields).toHaveLength(4)
    })

    it('listFields excludes relation and large text fields', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const post = models.find((m) => m.name === 'Post')!
      const listFieldNames = post.listFields.map((f) => f.name)
      expect(listFieldNames).not.toContain('user')
      expect(listFieldNames).not.toContain('body')
    })

    it('formFields excludes auto-id and read-only fields', () => {
      const models = parseDmmf(FULL_DMMF, {})
      const post = models.find((m) => m.name === 'Post')!
      const formFieldNames = post.formFields.map((f) => f.name)
      expect(formFieldNames).not.toContain('id') // auto-increment id
      expect(formFieldNames).not.toContain('user') // relation
    })
  })

  it('returns an empty array when all models are hidden', () => {
    const models = parseDmmf(
      makeDmmf(['Session', 'Account', 'Verification']),
      {},
    )
    expect(models).toHaveLength(0)
  })
})
