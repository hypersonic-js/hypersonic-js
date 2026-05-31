// ── Minimal DMMF types ───────────────────────────────────────────────────────
// Structurally compatible with Prisma's DMMF.Document so callers can pass
// Prisma.dmmf directly without any casting.

export interface DmmfEnumValue {
  name: string
  dbName: string | null
}

export interface DmmfEnum {
  name: string
  values: DmmfEnumValue[]
  dbName: string | null
}

export interface DmmfField {
  name: string
  /** 'String' | 'Int' | 'Boolean' | 'DateTime' | ... or model/enum name */
  type: string
  kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  isRequired: boolean
  isUnique: boolean
  isId: boolean
  isList: boolean
  hasDefaultValue: boolean
  isReadOnly: boolean
  isGenerated?: boolean
  isUpdatedAt: boolean
  relationName?: string | null
  relationFromFields?: string[]
  relationToFields?: string[]
}

export interface DmmfModel {
  name: string
  fields: DmmfField[]
  dbName: string | null
}

export interface DmmfDocument {
  datamodel: {
    models: DmmfModel[]
    enums: DmmfEnum[]
  }
}

// ── Admin model metadata ─────────────────────────────────────────────────────

export type AdminFieldKind = 'scalar' | 'relation' | 'enum'

export interface AdminFieldMeta {
  name: string
  /** Raw Prisma scalar type: 'String' | 'Int' | 'Boolean' | 'DateTime' | … */
  prismaType: string
  kind: AdminFieldKind
  isRequired: boolean
  isId: boolean
  isUnique: boolean
  /** True when the field has a default value (auto-increment, now(), cuid…) */
  hasDefault: boolean
  /** True for auto-managed fields excluded from create/edit forms. */
  isReadOnly: boolean
  isList: boolean
  /** Model name for relation fields. */
  relationTo?: string
  /** Possible values for enum fields. */
  enumValues?: string[]
}

export interface AdminModelMeta {
  name: string
  /** Lowercase model name used in URL params, e.g. 'post'. */
  urlSlug: string
  /** Plural display name shown in UI headings, e.g. 'Posts'. */
  displayName: string
  /** Name of the primary key field, usually 'id'. */
  idField: string
  /** Whether the id is numeric (Int/Float) or string-based. */
  idType: 'string' | 'number'
  /** Best field to use as a human-readable label in list views. */
  displayField: string
  /** All mapped fields. */
  fields: AdminFieldMeta[]
  /** Subset shown as table columns: scalar, non-large-text, capped at 6. */
  listFields: AdminFieldMeta[]
  /** Subset shown in create/edit forms: excludes read-only & auto-id fields. */
  formFields: AdminFieldMeta[]
}

export interface AdminPaginationMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface PaginationParams {
  page: number
  perPage: number
  skip: number
  take: number
}

// ── Auth interface ───────────────────────────────────────────────────────────
// Minimal structural interface — satisfied by Better Auth's auth instance
// with the admin plugin enabled. The admin plugin adds a `role` field to the
// session user; we check role === 'admin' instead of an email allowlist.

export interface AdminAuthLike {
  api: {
    getSession(opts: { headers: unknown }): Promise<{ user: { role: string } } | null>
  }
}

// ── Prisma interface ─────────────────────────────────────────────────────────
// Minimal structural interface — satisfied by any PrismaClient instance.

export interface PrismaClientLike {
  $disconnect(): Promise<void>
}

// ── Public option types ──────────────────────────────────────────────────────

export interface AdminOptions {
  /** Prisma DMMF document — pass `Prisma.dmmf` from `@prisma/client`. */
  dmmf: DmmfDocument
  /** Better Auth instance with the admin plugin enabled — pass `app.auth`. */
  auth: AdminAuthLike
  /** Route prefix for all admin routes. Defaults to '/admin'. */
  prefix?: string
  /** When true, shows the default hidden Better Auth tables. Defaults to false. */
  showAuthModels?: boolean
  /** Additional model names to hide on top of the built-in hidden list. */
  hiddenModels?: string[]
}

export interface ScaffoldOptions {
  /** Directory to write admin page files into. Defaults to 'resources/js/Pages'. */
  targetDir?: string
  /** Overwrite existing files. Defaults to false. */
  force?: boolean
}

export interface ScaffoldResult {
  written: string[]
  skipped: string[]
}