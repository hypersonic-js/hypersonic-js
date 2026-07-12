import type { DmmfField, DmmfModel } from './types.js'

/**
 * Doc-comment directive marking a scalar String field as admin-managed file
 * storage, e.g.:
 * ```prisma
 * /// @admin.file
 * coverImage String?
 * ```
 * Matched as a whole token (surrounded by whitespace or string boundaries)
 * so it still triggers inside a longer doc comment (`/// @admin.file — the
 * post's cover image`) without false-positiving on unrelated text that
 * merely mentions "@admin.file" as a substring of another word.
 */
const FILE_DIRECTIVE_PATTERN = /(^|\s)@admin\.file(\s|$)/

/** True when `field`'s Prisma doc comment contains the `@admin.file` directive. */
export function hasFileDirective(field: DmmfField): boolean {
  return FILE_DIRECTIVE_PATTERN.test(field.documentation ?? '')
}

/**
 * Derives the required companion Boolean field name for a file field, e.g.
 * `coverImage` → `coverImagePublic`. The single source of truth for this
 * naming convention — used by both `validateFileFields` (to check the
 * field exists) and `mapField` (to record it on `AdminFieldMeta.filePublicField`)
 * so the convention is never duplicated between the two.
 */
export function getFilePublicFieldName(fileFieldName: string): string {
  return `${fileFieldName}Public`
}

/**
 * Validates every `@admin.file` field on a model:
 *  - must be a scalar `String` field — the column that stores the S3 key.
 *  - must have a companion `{name}Public` scalar `Boolean` field — tracks
 *    the public/private toggle set from the admin upload UI.
 *
 * Throws a descriptive, generate-time error on the first violation found.
 * Called by `parseDmmf` before mapping fields, so a misconfigured schema
 * fails `hypersonic admin generate-meta` immediately with an actionable
 * message, rather than silently producing a broken `admin-meta.json`.
 */
export function validateFileFields(model: DmmfModel): void {
  for (const field of model.fields) {
    if (!hasFileDirective(field)) continue

    if (field.kind !== 'scalar' || field.type !== 'String') {
      throw new Error(
        `Admin: model "${model.name}" field "${field.name}" has the @admin.file directive ` +
          `but is not a scalar String field.`,
      )
    }

    const companionName = getFilePublicFieldName(field.name)
    const companion = model.fields.find((f) => f.name === companionName)

    if (companion === undefined) {
      throw new Error(
        `Admin: model "${model.name}" field "${field.name}" has @admin.file but is missing its ` +
          `companion field. Add "${companionName} Boolean @default(false)" to the model.`,
      )
    }

    if (companion.kind !== 'scalar' || companion.type !== 'Boolean') {
      throw new Error(
        `Admin: model "${model.name}" field "${companionName}" must be a scalar Boolean field — ` +
          `it is the required companion to the @admin.file field "${field.name}".`,
      )
    }
  }
}
