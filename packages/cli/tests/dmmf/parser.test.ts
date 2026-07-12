import { describe, it, expect } from 'vitest'
import { toDisplayName, parseDmmf } from '../../src/dmmf/parser.js'
import type { DmmfDocument, DmmfField } from '../../src/dmmf/types.js'

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

// A reusable DMMF document with Post having a FK relation to User
const POST_WITH_USER_FK: DmmfDocument = {
  datamodel: {
    models: [
      {
        name: 'Post',
        dbName: null,
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
          { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
          { name: 'userId', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: true, isUpdatedAt: false },
          {
            name: 'user', type: 'User', kind: 'object',
            isRequired: true, isUnique: false, isId: false, isList: false,
            hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false,
            relationName: 'PostToUser', relationFromFields: ['userId'], relationToFields: ['id'],
          } as DmmfField,
        ],
      },
      {
        name: 'User',
        dbName: null,
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
        ],
      },
    ],
    enums: [],
  },
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

  it('all AdminFieldMeta objects carry an isForeignKey boolean', () => {
    const models = parseDmmf(makeMinimalDmmf())
    for (const f of models.flatMap((m) => m.fields)) {
      expect(typeof f.isForeignKey).toBe('boolean')
    }
  })

  // ── FK scalar detection ──────────────────────────────────────────────────

  it('marks FK scalar fields isForeignKey:true', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const userId = model!.fields.find((f) => f.name === 'userId')
    expect(userId!.isForeignKey).toBe(true)
  })

  it('sets relatedModelName on FK scalar', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const userId = model!.fields.find((f) => f.name === 'userId')
    expect(userId!.relatedModelName).toBe('User')
  })

  it('sets relatedModelSlug on FK scalar', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const userId = model!.fields.find((f) => f.name === 'userId')
    expect(userId!.relatedModelSlug).toBe('user')
  })

  it('relatedModelSlug matches the related model urlSlug', () => {
    const models = parseDmmf(POST_WITH_USER_FK)
    const userModel = models.find((m) => m.name === 'User')!
    const userId = models[0]!.fields.find((f) => f.name === 'userId')!
    expect(userId.relatedModelSlug).toBe(userModel.urlSlug)
  })

  it('FK scalar fields appear in formFields', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    expect(model!.formFields.map((f) => f.name)).toContain('userId')
  })

  it('relation object field does NOT appear in formFields', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    expect(model!.formFields.map((f) => f.name)).not.toContain('user')
  })

  it('relatedModelName is set on FK scalar in formFields', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const userId = model!.formFields.find((f) => f.name === 'userId')
    expect(userId!.relatedModelName).toBe('User')
  })

  it('relatedModelSlug is set on FK scalar in formFields', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const userId = model!.formFields.find((f) => f.name === 'userId')
    expect(userId!.relatedModelSlug).toBe('user')
  })

  it('relatedModelSlug for a multi-word model is fully lowercased, not camelCase', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [
          {
            name: 'Post',
            dbName: null,
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
              { name: 'userProfileId', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: true, isUpdatedAt: false },
              {
                name: 'userProfile', type: 'UserProfile', kind: 'object',
                isRequired: true, isUnique: false, isId: false, isList: false,
                hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false,
                relationName: 'PostToUserProfile', relationFromFields: ['userProfileId'], relationToFields: ['id'],
              } as DmmfField,
            ],
          },
          {
            name: 'UserProfile',
            dbName: null,
            fields: [
              { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
            ],
          },
        ],
        enums: [],
      },
    }
    const [postModel] = parseDmmf(dmmf)
    const fkField = postModel!.fields.find((f) => f.name === 'userProfileId')!
    expect(fkField.relatedModelSlug).toBe('userprofile')
    expect(fkField.relatedModelSlug).not.toBe('userProfile')
  })

  it('does not throw and produces no FK mapping when relationFromFields is undefined', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [
          {
            name: 'Post',
            dbName: null,
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
              {
                name: 'author', type: 'User', kind: 'object',
                isRequired: true, isUnique: false, isId: false, isList: false,
                hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false,
                relationName: 'PostToUser',
                // relationFromFields intentionally omitted (undefined)
              } as DmmfField,
            ],
          },
          {
            name: 'User',
            dbName: null,
            fields: [
              { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
            ],
          },
        ],
        enums: [],
      },
    }
    expect(() => parseDmmf(dmmf)).not.toThrow()
    const [model] = parseDmmf(dmmf)
    // No scalar FK field carries relatedModelName/relatedModelSlug since
    // relationFromFields (the only source of FK scalar names) was undefined.
    expect(model!.fields.every((f) => f.relatedModelName === undefined)).toBe(true)
  })

  it('falls back to type.toLowerCase() for relatedModelSlug when the related model is absent from datamodel.models', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [
          {
            name: 'Post',
            dbName: null,
            fields: [
              { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
              { name: 'authorId', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: true, isUpdatedAt: false },
              {
                name: 'author', type: 'User', kind: 'object',
                isRequired: true, isUnique: false, isId: false, isList: false,
                hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false,
                relationName: 'PostToUser', relationFromFields: ['authorId'], relationToFields: ['id'],
              } as DmmfField,
              // Note: 'User' is NOT included as a model below — simulates a
              // relation to a model filtered out of the DMMF document.
            ],
          },
        ],
        enums: [],
      },
    }
    const [model] = parseDmmf(dmmf)
    const authorId = model!.fields.find((f) => f.name === 'authorId')!
    expect(authorId.relatedModelSlug).toBe('user')
  })

  it('non-FK scalars have no relatedModelSlug', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const title = model!.fields.find((f) => f.name === 'title')
    expect(title!.isForeignKey).toBe(false)
    expect(title!.relatedModelName).toBeUndefined()
    expect(title!.relatedModelSlug).toBeUndefined()
  })

  // ── @admin.file fields ────────────────────────────────────────────────────

  it('classifies a valid @admin.file field as kind "file" with filePublicField set', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'coverImage', type: 'String', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false, documentation: '@admin.file' },
            { name: 'coverImagePublic', type: 'Boolean', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
          ],
        }],
        enums: [],
      },
    }
    const [model] = parseDmmf(dmmf)
    const coverImage = model!.fields.find((f) => f.name === 'coverImage')
    expect(coverImage!.kind).toBe('file')
    expect(coverImage!.filePublicField).toBe('coverImagePublic')
  })

  it('includes both the file field and its companion Boolean in formFields', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'coverImage', type: 'String', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false, documentation: '@admin.file' },
            { name: 'coverImagePublic', type: 'Boolean', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
          ],
        }],
        enums: [],
      },
    }
    const [model] = parseDmmf(dmmf)
    const formFieldNames = model!.formFields.map((f) => f.name)
    expect(formFieldNames).toContain('coverImage')
    // Kept in formFields (not hidden) since coerceData uses formFields as its
    // mass-assignment allowlist — see getFormFields' doc comment.
    expect(formFieldNames).toContain('coverImagePublic')
  })

  it('throws a descriptive error when an @admin.file field is missing its companion Boolean', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'coverImage', type: 'String', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false, documentation: '@admin.file' },
          ],
        }],
        enums: [],
      },
    }
    expect(() => parseDmmf(dmmf)).toThrowError(/missing its companion field/)
  })

  it('validates file fields before checking for an empty model, surfacing the file-field error first', () => {
    // Regression guard: validateFileFields must run early in parseDmmf so a
    // misconfigured file field is reported with its own specific message,
    // not masked by unrelated downstream errors.
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'coverImage', type: 'Int', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false, documentation: '@admin.file' },
          ],
        }],
        enums: [],
      },
    }
    expect(() => parseDmmf(dmmf)).toThrowError(/is not a scalar String field/)
  })

  it('auto-managed timestamp fields are NOT in formFields', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
            { name: 'createdAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'updatedAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: true },
          ],
        }],
        enums: [],
      },
    }
    const [model] = parseDmmf(dmmf)
    const names = model!.formFields.map((f) => f.name)
    expect(names).not.toContain('createdAt')
    expect(names).not.toContain('updatedAt')
    expect(names).toContain('title')
  })

  it('non-FK isReadOnly scalars stay excluded from formFields', () => {
    const dmmf: DmmfDocument = {
      datamodel: {
        models: [{
          name: 'Post', dbName: null,
          fields: [
            { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isUpdatedAt: false },
            { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isUpdatedAt: false },
            { name: 'computedSlug', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: true, isUpdatedAt: false },
          ],
        }],
        enums: [],
      },
    }
    const [model] = parseDmmf(dmmf)
    const names = model!.formFields.map((f) => f.name)
    expect(names).not.toContain('computedSlug')
    expect(names).toContain('title')
  })

  it('regular (non-FK) scalars have isForeignKey:false and no relatedModelName', () => {
    const [model] = parseDmmf(POST_WITH_USER_FK)
    const title = model!.fields.find((f) => f.name === 'title')
    expect(title!.isForeignKey).toBe(false)
    expect(title!.relatedModelName).toBeUndefined()
  })
})