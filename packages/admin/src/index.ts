export { mountAdmin } from './mount.js'
export { scaffoldAdmin } from './scaffold/index.js'

export type {
  AdminOptions,
  AdminModelMeta,
  AdminFieldMeta,
  AdminFieldKind,
  AdminPaginationMeta,
  AdminAuthLike,
  AdminFileStorageLike,
  LoggerLike,
  ScaffoldOptions,
  ScaffoldResult,
} from './types.js'

export { DEFAULT_HIDDEN_MODELS, DEFAULT_PREFIX, DEFAULT_PER_PAGE, MAX_RELATED_OPTIONS } from './constants.js'