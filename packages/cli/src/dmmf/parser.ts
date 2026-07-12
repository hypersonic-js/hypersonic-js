import type { AdminModelMeta } from '@hypersonic-js/admin'
import type { DmmfDocument } from './types.js'
import { mapField, getDisplayField, getListFields, getFormFields } from './fields.js'
import { validateFileFields } from './file-fields.js'

/**
 * Converts a model name to a plural display name.
 * Handles the most common English pluralisation rules.
 */
export function toDisplayName(name: string): string {
  if (name.endsWith('s')) return name
  if (name.endsWith('y') && !/[aeiou]y$/i.test(name)) {
    return name.slice(0, -1) + 'ies'
  }
  return name + 's'
}

/**
 * Maps a full Prisma DMMF document into AdminModelMeta for all models.
 * No filtering is applied — filtering by showAuthModels / hiddenModels
 * happens at runtime in mountAdmin.
 */
export function parseDmmf(dmmf: DmmfDocument): AdminModelMeta[] {
  // Pre-build model name → urlSlug for all models so FK fields can carry the
  // correct slug without any client-side derivation. A model named
  // "UserProfile" gets slug "userprofile", not "userProfile".
  const modelToSlug = new Map<string, string>(
    dmmf.datamodel.models.map((m) => [m.name, m.name.toLowerCase()]),
  )

  return dmmf.datamodel.models.map((model) => {
    validateFileFields(model)

    // Build a map of FK scalar name → related model name.
    // Each relation (object) field lists its FK scalars in relationFromFields
    // and its type is the related model name.
    // e.g. `user User @relation(fields: [userId], …)` → { 'userId' → 'User' }
    const fkToModel = new Map<string, string>(
      model.fields
        .filter((f) => f.kind === 'object')
        .flatMap((f) =>
          (f.relationFromFields ?? []).map((scalar) => [scalar, f.type] as [string, string]),
        ),
    )

    // Build a map of FK scalar name → related model urlSlug.
    // Used by ModelForm to construct the correct /related-options/:slug URL
    // for load-more pagination instead of deriving it client-side.
    const fkToSlug = new Map<string, string>(
      model.fields
        .filter((f) => f.kind === 'object')
        .flatMap((f) =>
          (f.relationFromFields ?? []).map(
            (scalar) =>
              [scalar, modelToSlug.get(f.type) ?? f.type.toLowerCase()] as [string, string],
          ),
        ),
    )

    const fields = model.fields.map((f) => mapField(f, dmmf.datamodel.enums, fkToModel, fkToSlug))

    const idField = fields.find((f) => f.isId) ?? fields[0]
    if (idField === undefined) {
      throw new Error(`Admin: model "${model.name}" has no fields — cannot build admin meta.`)
    }

    const idType: 'string' | 'number' =
      idField.prismaType === 'Int' || idField.prismaType === 'Float' ? 'number' : 'string'

    return {
      name: model.name,
      urlSlug: model.name.toLowerCase(),
      displayName: toDisplayName(model.name),
      idField: idField.name,
      idType,
      displayField: getDisplayField(fields),
      fields,
      listFields: getListFields(fields),
      formFields: getFormFields(fields),
    }
  })
}