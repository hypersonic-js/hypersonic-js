// ── Admin field / model metadata ─────────────────────────────────────────────

export type AdminFieldKind = 'scalar' | 'relation' | 'enum' | 'file'

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
  /**
   * For FK scalar fields, the URL slug of the related model as registered in
   * the admin router (e.g. `'user'` for `userId`, `'userprofile'` for a
   * `UserProfile` model). Used by ModelForm to construct the correct
   * `/related-options/:slug` URL for load-more pagination. Always equals the
   * related model's `urlSlug` — never a client-side derivation.
   */
  relatedModelSlug?: string
  isList: boolean
  relationTo?: string
  enumValues?: string[]
  /**
   * For `kind: 'file'` fields only — the name of the required companion
   * scalar `Boolean` field that tracks this file's public/private toggle
   * (e.g. `'coverImagePublic'` for a file field named `'coverImage'`).
   * Set by `getFilePublicFieldName` in `@hypersonic-js/cli`'s DMMF parser —
   * the single source of truth for the `{name}Public` naming convention.
   */
  filePublicField?: string
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

/**
 * Minimal auth interface satisfied by any Better Auth instance.
 *
 * The three optional admin methods (`createUser`, `adminUpdateUser`,
 * `removeUser`) are present when the Better Auth admin plugin is enabled.
 * When they exist, the admin router routes User model mutations through Better
 * Auth instead of calling Prisma directly — ensuring password hashing,
 * session cleanup, and other auth lifecycle hooks are respected.
 */
export interface AdminAuthLike {
  api: {
    getSession(opts: { headers: unknown }): Promise<{ user: { role: string } } | null>

    /** Creates a user via the Better Auth admin plugin. */
    createUser?: (opts: {
      body: {
        email: string
        name: string
        password: string
        role?: string
        data?: Record<string, unknown>
      }
    }) => Promise<{ user: unknown }>

    /**
     * Updates a user via the Better Auth admin plugin.
     * Requires the calling admin's session headers for permission checks.
     */
    adminUpdateUser?: (opts: {
      body: { userId: string; data: Record<string, unknown> }
      headers: unknown
    }) => Promise<unknown>

    /**
     * Deletes a user via the Better Auth admin plugin.
     * Also revokes all active sessions for that user.
     * Requires the calling admin's session headers for permission checks.
     */
    removeUser?: (opts: {
      body: { userId: string }
      headers: unknown
    }) => Promise<unknown>
  }
}

// ── Prisma ───────────────────────────────────────────────────────────────────

export interface PrismaClientLike {
  $disconnect(): Promise<void>
}

// ── Logger ───────────────────────────────────────────────────────────────────

/**
 * Minimal structured-logging interface satisfied by any Pino Logger instance.
 * Keeping this as a local interface decouples the admin package from a direct
 * pino dependency while still enabling rich structured log output when the
 * host application passes `app.logger` from @hypersonic-js/core.
 */
export interface LoggerLike {
  error(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
}

// ── File storage ─────────────────────────────────────────────────────────────

/**
 * Minimal structural interface satisfied by `@hypersonic-js/s3`'s `S3Storage`.
 * Kept as a local interface — rather than a hard dependency on
 * `@hypersonic-js/s3` — so admin only needs a file-storage instance passed
 * in, the same pattern already used for `PrismaClientLike`, `LoggerLike`,
 * and `AdminAuthLike`. An actual `S3Storage` instance satisfies this
 * structurally, with no adapter needed.
 */
export interface AdminFileStorageLike {
  getPresignedUploadUrl(input: {
    filename: string
    mimeType?: string
    expiresIn?: number
  }): Promise<{ url: string; key: string }>
  /**
   * Used by the admin router's view/download redirect route. Always used
   * regardless of the file's public/private toggle — within the admin
   * dashboard the caller is already an authenticated admin, so a presigned
   * URL is simpler and more uniform than also tracking the bucket's public
   * base URL here. The public/private toggle's effect is scoped to how the
   * developer's own app-level routes choose to serve the file, not to
   * admin's own preview links.
   */
  getPresignedDownloadUrl(fileKey: string, expiresIn?: number): Promise<string>
  delete(fileKeys: string | string[]): Promise<void>
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface AdminOptions {
  /** Pre-generated admin model metadata — pass the content of prisma/admin-meta.json. */
  meta: AdminModelMeta[]
  /** Better Auth instance. When the admin plugin is enabled, user CRUD is routed through it. */
  auth: AdminAuthLike
  /** Route prefix for all admin routes. Defaults to '/admin'. */
  prefix?: string
  /** When true, shows the default hidden Better Auth tables. Defaults to false. */
  showAuthModels?: boolean
  /** Additional model names to hide from the admin nav. */
  hiddenModels?: string[]
  /** Optional structured logger — pass `app.logger` from createApp(). */
  logger?: LoggerLike
  /**
   * Name of the Better Auth user model in your Prisma schema.
   * When `auth.api.createUser` is present, all create / update / delete
   * operations on this model are routed through the Better Auth admin API
   * instead of calling Prisma directly.
   * Defaults to `'User'`.
   */
  betterAuthUserModel?: string
  /**
   * File storage backend for `/// @admin.file` fields — pass an
   * `S3Storage` instance from `@hypersonic-js/s3`. Required for models with
   * file fields to support uploads and automatic cleanup of replaced/deleted
   * files; omitted otherwise. Better Auth-routed User mutations (when the
   * Better Auth admin plugin is active) do NOT get automatic file cleanup,
   * since those go through Better Auth's own API rather than Prisma.
   */
  fileStorage?: AdminFileStorageLike
}

// ── Scaffold ──────────────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  targetDir?: string
  force?: boolean
}

export interface ScaffoldResult {
  written: string[]
  skipped: string[]
}