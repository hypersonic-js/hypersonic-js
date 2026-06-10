// ── Admin field / model metadata ─────────────────────────────────────────────

export type AdminFieldKind = 'scalar' | 'relation' | 'enum'

export interface AdminFieldMeta {
  name: string
  /** Raw Prisma scalar type: 'String' | 'Int' | 'Boolean' | 'DateTime' | … */
  prismaType: string
  kind: AdminFieldKind
  isRequired: boolean
  isId: boolean
  isUnique: boolean
  hasDefault: boolean
  isReadOnly: boolean
  /**
   * True when this scalar field is a FK column backing a Prisma relation
   * (e.g. `userId` for a `user User @relation(…)` field).
   * Prisma marks FK scalars isReadOnly in its DMMF, but admins still need to
   * set them when creating/editing records. The router renders them as a
   * <select> dropdown populated from the related model.
   */
  isForeignKey: boolean
  /**
   * For FK scalar fields, the name of the related Prisma model
   * (e.g. `'User'` for `userId`). Used by the admin router to fetch
   * <select> options when rendering the create/edit form.
   */
  relatedModelName?: string
  isList: boolean
  relationTo?: string
  enumValues?: string[]
}

export interface AdminModelMeta {
  name: string
  urlSlug: string
  displayName: string
  idField: string
  idType: 'string' | 'number'
  displayField: string
  fields: AdminFieldMeta[]
  listFields: AdminFieldMeta[]
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

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AdminAuthLike {
  api: {
    getSession(opts: { headers: unknown }): Promise<{ user: { role: string } } | null>
  }
}

// ── Prisma ───────────────────────────────────────────────────────────────────

export interface PrismaClientLike {
  $disconnect(): Promise<void>
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface AdminOptions {
  /** Pre-generated admin model metadata — pass the content of prisma/admin-meta.json. */
  meta: AdminModelMeta[]
  /** Better Auth instance with the admin plugin enabled. */
  auth: AdminAuthLike
  /** Route prefix for all admin routes. Defaults to '/admin'. */
  prefix?: string
  /** When true, shows the default hidden Better Auth tables. Defaults to false. */
  showAuthModels?: boolean
  /** Additional model names to hide on top of the built-in hidden list. */
  hiddenModels?: string[]
}

export interface ScaffoldOptions {
  targetDir?: string
  force?: boolean
}

export interface ScaffoldResult {
  written: string[]
  skipped: string[]
}