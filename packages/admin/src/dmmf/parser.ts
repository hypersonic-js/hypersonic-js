import type { DmmfDocument, AdminModelMeta, AdminOptions } from '../types.js'
import { DEFAULT_HIDDEN_MODELS } from '../constants.js'
import { mapField, getDisplayField, getListFields, getFormFields } from './fields.js'

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
 * Parses the Prisma DMMF document into an array of AdminModelMeta objects,
 * applying visibility rules (hidden models) in the process.
 *
 * @param dmmf - The DMMF document from `Prisma.dmmf`
 * @param options - Subset of AdminOptions that affect visibility
 */
export function parseDmmf(
  dmmf: DmmfDocument,
  options: Pick<AdminOptions, 'showAuthModels' | 'hiddenModels'>,
): AdminModelMeta[] {
  const hidden = new Set<string>([
    ...(options.showAuthModels === true ? [] : DEFAULT_HIDDEN_MODELS),
    ...(options.hiddenModels ?? []),
  ])

  return dmmf.datamodel.models
    .filter((model) => !hidden.has(model.name))
    .map((model) => {
      const fields = model.fields.map((f) => mapField(f, dmmf.datamodel.enums))

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
