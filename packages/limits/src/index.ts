// Middleware factory
export { createLimiter } from './middleware.js'
export type { Limiter, LimitFactory, CreateLimiterOptions } from './middleware.js'

// Better Auth integration
export { buildAuthLimitsConfig, buildMemoryAuthStorage, buildDatabaseAuthStorage, buildRedisAuthStorage } from './auth-storage.js'
export type { BetterAuthLimitsConfig, BetterAuthCustomStorage, BetterAuthSecondaryStorage } from './auth-storage.js'

// Stores
export { PrismaStore, PrismaBlockStore } from './stores/prisma-store.js'
export type { PrismaLimitsClient, PrismaRateLimitModel, PrismaAuthRateLimitModel } from './stores/prisma-store.js'
export { RedisBlockStore } from './stores/redis-store.js'
export type { RedisClientLike, RedisStoreResult } from './stores/redis-store.js'
export { createMemoryStore } from './stores/memory-store.js'
export { createRedisStore } from './stores/redis-store.js'

// Block store
export { MemoryBlockStore } from './block-store.js'
export type { BlockStore } from './block-store.js'

// Types
export type { LimitsConfig, LimitsBackend, LimitOptions } from './types.js'