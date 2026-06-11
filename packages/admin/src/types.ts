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