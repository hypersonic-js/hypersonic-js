// Config
export { defineConfig } from './config/define-config.js'
export { loadConfig, importConfigFile } from './config/loader.js'
export { validateEnv, buildEnvSchema } from './config/env.js'
export type {
  HypersonicConfig,
  ServerConfig,
  AuthConfig,
  InertiaConfig,
  AuthProviders,
  DatabaseConfig,
  DatabaseProvider,
  LimitsConfig,
  LimitsBackend,
} from './config/types.js'
export type { Env } from './config/env.js'
export type { LoadedConfig } from './config/loader.js'

// Server
export { createApp } from './server/app.js'
export type { CreateAppOptions, HypersonicApp } from './server/types.js'

// Database
export { getPrismaClient, setPrismaClient, disconnectPrismaClient } from './database/client.js'
export { createDatabaseAdapter } from './database/adapter.js'
export type { PrismaClientLike } from './database/client.js'

// Auth
export { createAuth } from './auth/setup.js'
export { mountAuth } from './auth/middleware.js'
export type {
  AuthSetupOptions,
  SocialProviderCredentials,
  BetterAuthSecondaryStorage,
  BetterAuthCustomStorage,
  AuthRateLimitOptions,
} from './auth/types.js'

// Inertia
export { createInertiaMiddleware, createInertiaErrorHandler } from './inertia/middleware.js'
export { createViteSetup } from './inertia/vite.js'
export type { InertiaPage, InertiaOptions, ViteSetup } from './inertia/types.js'

// Utils
export { HttpError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError } from './utils/errors.js'