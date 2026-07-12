import type { AdminFieldMeta, AdminFieldKind } from '@hypersonic-js/admin'
import type { DmmfField, DmmfEnum } from './types.js'
import {
  DISPLAY_FIELD_CANDIDATES,
  AUTO_MANAGED_FIELD_NAMES,
  LARGE_TEXT_FIELD_NAMES,
} from './constants.js'

/** Maps a DMMF field kind to our simplified AdminFieldKind. */
export function classifyField(field: DmmfField): AdminFieldKind {
  if (field.kind === 'object') return 'relation'
  if (field.kind === 'enum') return 'enum'
  return 'scalar'
}

/**
 * Returns true for fields that are auto-managed by Prisma or the database
 * and should therefore be excluded from admin create/edit forms.
 * Covers:
 *  - field.isUpdatedAt — @updatedAt fields managed by the Prisma client
 *  - AUTO_MANAGED_FIELD_NAMES — convention-based names (createdAt / updatedAt)
 *                               for schemas where Prisma does not set the flags
 *                               (e.g. Better Auth-managed timestamps)
 *
 * NOTE: We intentionally do NOT check field.isReadOnly here. Prisma sets
 * isReadOnly on FK scalars as well as on auto-managed columns. FK scalars
 * must remain editable in the admin form; auto-managed fields are caught by
 * the isUpdatedAt flag and the name-convention list above.
 */
export function isAutoManagedField(field: DmmfField): boolean {
  if (field.isUpdatedAt) return true
  return (AUTO_MANAGED_FIELD_NAMES as readonly string[]).includes(field.name)
}

/** Chooses the most human-readable field name for list view labels. */
export function getDisplayField(fields: AdminFieldMeta[]): string {
  for (const candidate of DISPLAY_FIELD_CANDIDATES) {
    const found = fields.find((f) => f.name === candidate && f.kind === 'scalar')
    if (found !== undefined) return found.name
  }
  const idField = fields.find((f) => f.isId)
  return idField?.name ?? 'id'
}

/** Returns the subset of fields suitable for table list columns. Capped at 6. */
export function getListFields(fields: AdminFieldMeta[]): AdminFieldMeta[] {
  return fields
    .filter((f) => f.kind === 'scalar' && !f.isList)
    .filter((f) => !(LARGE_TEXT_FIELD_NAMES as readonly string[]).includes(f.name))
    .slice(0, 6)
}

/**
 * Returns the subset of fields to show in create/edit forms.
 *
 * Inclusion rules:
 *  - Relation fields are excluded (they have no direct column).
 *  - Auto-managed read-only fields (timestamps, @updatedAt) are excluded.
 *  - FK scalar fields are INCLUDED even though isReadOnly is true — the admin
 *    needs to supply the FK value; the router renders them as a <select>.
 *  - Id fields with a default (e.g. autoincrement) are excluded.
 */
export function getFormFields(fields: AdminFieldMeta[]): AdminFieldMeta[] {
  return fields.filter((f) => {
    if (f.kind === 'relation') return false
    if (f.isReadOnly && !f.isForeignKey) return false
    if (f.isId && f.hasDefault) return false
    return true
  })
}

/**
 * Maps a raw DMMF field to an AdminFieldMeta, resolving enum values.
 *
 * @param field     The DMMF field to map.
 * @param enums     All enum definitions from the DMMF document.
 * @param fkToModel Map of FK scalar field name → related model name, built by
 *                  parseDmmf from relation fields' relationFromFields.
 *                  e.g. new Map([['userId', 'User'], ['authorId', 'Author']])
 * @param fkToSlug  Map of FK scalar field name → related model urlSlug, built
 *                  by parseDmmf. Always use this — never derive the slug
 *                  client-side from the model name.
 *                  e.g. new Map([['userId', 'user'], ['userProfileId', 'userprofile']])
 */
export function mapField(
  field: DmmfField,
  enums: DmmfEnum[],
  fkToModel: ReadonlyMap<string, string> = new Map(),
  fkToSlug: ReadonlyMap<string, string> = new Map(),
): AdminFieldMeta {
  const kind = classifyField(field)
  const enumDef = kind === 'enum' ? enums.find((e) => e.name === field.type) : undefined
  const isForeignKey = field.kind === 'scalar' && fkToModel.has(field.name)

  return {
    name: field.name,
    prismaType: field.type,
    kind,
    isRequired: field.isRequired,
    isId: field.isId,
    isUnique: field.isUnique,
    hasDefault: field.hasDefaultValue,
    isReadOnly: field.isReadOnly || isAutoManagedField(field),
    isForeignKey,
    relatedModelName: isForeignKey ? fkToModel.get(field.name) : undefined,
    relatedModelSlug: isForeignKey ? fkToSlug.get(field.name) : undefined,
    isList: field.isList,
    relationTo: field.kind === 'object' ? field.type : undefined,
    enumValues: enumDef?.values.map((v) => v.name),
  }
}