/** Better Auth internal tables hidden by default in the admin dashboard. */
export const DEFAULT_HIDDEN_MODELS = ['Session', 'Account', 'Verification'] as const

/** Default route prefix for the admin dashboard. */
export const DEFAULT_PREFIX = '/admin'

/** Default number of records per page. */
export const DEFAULT_PER_PAGE = 20

/** Maximum records per page — prevents runaway queries. */
export const MAX_PER_PAGE = 100

/** Field names tried in order when picking a human-readable display label. */
export const DISPLAY_FIELD_CANDIDATES = ['name', 'title', 'email', 'label', 'slug'] as const

/** Field names that are auto-managed and excluded from create/edit forms. */
export const AUTO_MANAGED_FIELD_NAMES = ['createdAt', 'updatedAt'] as const

/** Field names whose content is too long for table list columns. */
export const LARGE_TEXT_FIELD_NAMES = ['body', 'content', 'description', 'text', 'html', 'markdown'] as const
