// Primary integration point
export { mountAdmin } from './mount.js'

// Scaffold (call once at project setup)
export { scaffoldAdmin } from './scaffold/index.js'

// Public types
export type {
  AdminOptions,
  AdminModelMeta,
  AdminFieldMeta,
  AdminFieldKind,
  AdminPaginationMeta,
  AdminAuthLike,
  DmmfDocument,
  DmmfModel,
  DmmfField,
  DmmfEnum,
  ScaffoldOptions,
  ScaffoldResult,
} from './types.js'

// Constants (exported so users can inspect or extend the defaults)
export { DEFAULT_HIDDEN_MODELS, DEFAULT_PREFIX, DEFAULT_PER_PAGE } from './constants.js'
