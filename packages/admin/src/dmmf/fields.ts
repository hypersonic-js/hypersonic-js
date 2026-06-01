import type { DmmfField, DmmfEnum, AdminFieldMeta, AdminFieldKind } from '../types.js'
import {
  DISPLAY_FIELD_CANDIDATES,
  AUTO_MANAGED_FIELD_NAMES,
  LARGE_TEXT_FIELD_NAMES,
} from '../constants.js'

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
 *  - field.isReadOnly  — Prisma's authoritative flag, set on FK scalars and
 *                        any other field Prisma considers unwritable directly
 *  - field.isUpdatedAt — @updatedAt fields managed by the Prisma client
 *  - AUTO_MANAGED_FIELD_NAMES — convention-based names (createdAt / updatedAt)
 *                               for schemas where Prisma does not set the flags
 *                               (e.g. Better Auth-managed timestamps)
 */
export function isReadOnlyField(field: DmmfField): boolean {
  if (field.isReadOnly) return true
  if (field.isUpdatedAt) return true
  return (AUTO_MANAGED_FIELD_NAMES as readonly string[]).includes(field.name)
}

/**
 * Chooses the most human-readable field name for list view labels.
 * Tries a priority list of common names; falls back to the id field.
 */
export function getDisplayField(fields: AdminFieldMeta[]): string {
  for (const candidate of DISPLAY_FIELD_CANDIDATES) {
    const found = fields.find((f) => f.name === candidate && f.kind === 'scalar')
    if (found !== undefined) return found.name
  }
  const idField = fields.find((f) => f.isId)
  return idField?.name ?? 'id'
}

/**
 * Returns the subset of fields suitable for table list columns.
 * Excludes relations, list fields, and overly long text fields.
 * Capped at 6 columns to keep tables readable.
 */
export function getListFields(fields: AdminFieldMeta[]): AdminFieldMeta[] {
  return fields
    .filter((f) => f.kind === 'scalar' && !f.isList)
    .filter((f) => !(LARGE_TEXT_FIELD_NAMES as readonly string[]).includes(f.name))
    .slice(0, 6)
}

/**
 * Returns the subset of fields to show in create/edit forms.
 * Excludes relations, read-only fields, and auto-id fields.
 */
export function getFormFields(fields: AdminFieldMeta[]): AdminFieldMeta[] {
  return fields.filter((f) => {
    if (f.kind === 'relation') return false
    if (f.isReadOnly) return false
    if (f.isId && f.hasDefault) return false
    return true
  })
}

/**
 * Maps a raw DMMF field to an AdminFieldMeta, looking up enum values
 * from the provided enum definitions.
 */
export function mapField(field: DmmfField, enums: DmmfEnum[]): AdminFieldMeta {
  const kind = classifyField(field)
  const enumDef = kind === 'enum' ? enums.find((e) => e.name === field.type) : undefined

  return {
    name: field.name,
    prismaType: field.type,
    kind,
    isRequired: field.isRequired,
    isId: field.isId,
    isUnique: field.isUnique,
    hasDefault: field.hasDefaultValue,
    isReadOnly: isReadOnlyField(field),
    isList: field.isList,
    relationTo: field.kind === 'object' ? field.type : undefined,
    enumValues: enumDef?.values.map((v) => v.name),
  }
}