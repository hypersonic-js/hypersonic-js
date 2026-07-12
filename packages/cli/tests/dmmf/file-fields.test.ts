import { describe, it, expect } from 'vitest'
import { hasFileDirective, getFilePublicFieldName, validateFileFields } from '../../src/dmmf/file-fields.js'
import type { DmmfField, DmmfModel } from '../../src/dmmf/types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<DmmfField> = {}): DmmfField {
  return {
    name: 'title', type: 'String', kind: 'scalar',
    isRequired: true, isUnique: false, isId: false, isList: false,
    hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false,
    ...overrides,
  }
}

function makeModel(fields: DmmfField[], name = 'Post'): DmmfModel {
  return { name, dbName: null, fields }
}

// ── hasFileDirective ──────────────────────────────────────────────────────────

describe('hasFileDirective', () => {
  it('returns false when documentation is undefined', () => {
    expect(hasFileDirective(makeField({ documentation: undefined }))).toBe(false)
  })

  it('returns false when documentation is empty', () => {
    expect(hasFileDirective(makeField({ documentation: '' }))).toBe(false)
  })

  it('returns false for unrelated documentation', () => {
    expect(hasFileDirective(makeField({ documentation: 'The post title' }))).toBe(false)
  })

  it('returns true when documentation is exactly the directive', () => {
    expect(hasFileDirective(makeField({ documentation: '@admin.file' }))).toBe(true)
  })

  it('returns true when the directive is followed by more text', () => {
    expect(hasFileDirective(makeField({ documentation: "@admin.file - the post's cover image" }))).toBe(true)
  })

  it('returns true when the directive is preceded by more text', () => {
    expect(hasFileDirective(makeField({ documentation: 'Cover image. @admin.file' }))).toBe(true)
  })

  it('returns true when the directive appears on its own line within multi-line documentation', () => {
    expect(hasFileDirective(makeField({ documentation: 'Cover image.\n@admin.file\nRequired.' }))).toBe(true)
  })

  it('does not false-positive on a substring match within another word', () => {
    expect(hasFileDirective(makeField({ documentation: 'see notesomething@admin.filesystem for details' }))).toBe(
      false,
    )
  })
})

// ── getFilePublicFieldName ────────────────────────────────────────────────────

describe('getFilePublicFieldName', () => {
  it('appends "Public" to the field name', () => {
    expect(getFilePublicFieldName('coverImage')).toBe('coverImagePublic')
  })

  it('works for single-word field names', () => {
    expect(getFilePublicFieldName('avatar')).toBe('avatarPublic')
  })
})

// ── validateFileFields ────────────────────────────────────────────────────────

describe('validateFileFields', () => {
  it('does not throw when no field has the directive', () => {
    const model = makeModel([makeField({ name: 'title' })])
    expect(() => validateFileFields(model)).not.toThrow()
  })

  it('does not throw for a valid file field with its companion Boolean present', () => {
    const model = makeModel([
      makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' }),
      makeField({ name: 'coverImagePublic', type: 'Boolean', kind: 'scalar' }),
    ])
    expect(() => validateFileFields(model)).not.toThrow()
  })

  it('throws when the directive is on a non-String scalar field', () => {
    const model = makeModel([makeField({ name: 'coverImage', type: 'Int', documentation: '@admin.file' })])
    expect(() => validateFileFields(model)).toThrowError(
      /model "Post" field "coverImage" has the @admin\.file directive but is not a scalar String field/,
    )
  })

  it('throws when the directive is on a relation field', () => {
    const model = makeModel([
      makeField({ name: 'author', type: 'User', kind: 'object', documentation: '@admin.file' }),
    ])
    expect(() => validateFileFields(model)).toThrowError(/is not a scalar String field/)
  })

  it('throws when the companion field is missing entirely', () => {
    const model = makeModel([makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' })])
    expect(() => validateFileFields(model)).toThrowError(
      /model "Post" field "coverImage" has @admin\.file but is missing its companion field/,
    )
  })

  it('the missing-companion error names the exact field to add', () => {
    const model = makeModel([makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' })])
    expect(() => validateFileFields(model)).toThrowError(
      /Add "coverImagePublic Boolean @default\(false\)" to the model/,
    )
  })

  it('throws when the companion field exists but is not a Boolean', () => {
    const model = makeModel([
      makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' }),
      makeField({ name: 'coverImagePublic', type: 'String', kind: 'scalar' }),
    ])
    expect(() => validateFileFields(model)).toThrowError(
      /field "coverImagePublic" must be a scalar Boolean field/,
    )
  })

  it('throws when the companion field exists but is a relation, not a scalar', () => {
    const model = makeModel([
      makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' }),
      makeField({ name: 'coverImagePublic', type: 'Visibility', kind: 'object' }),
    ])
    expect(() => validateFileFields(model)).toThrowError(
      /field "coverImagePublic" must be a scalar Boolean field/,
    )
  })

  it('validates every file field on the model, not just the first', () => {
    const model = makeModel([
      makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' }),
      makeField({ name: 'coverImagePublic', type: 'Boolean', kind: 'scalar' }),
      makeField({ name: 'attachment', type: 'String', documentation: '@admin.file' }),
      // attachmentPublic intentionally omitted
    ])
    expect(() => validateFileFields(model)).toThrowError(/field "attachment" has @admin\.file/)
  })

  it('includes the model name in the error message', () => {
    const model = makeModel(
      [makeField({ name: 'coverImage', type: 'String', documentation: '@admin.file' })],
      'Article',
    )
    expect(() => validateFileFields(model)).toThrowError(/model "Article"/)
  })
})
