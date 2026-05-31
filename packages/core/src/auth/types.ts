import type { DatabaseProvider } from '../config/types.js'

export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

export interface AuthSetupOptions {
  secret: string
  trustedOrigins: string[]
  /** Database provider — used to configure the Better Auth Prisma adapter. */
  provider: DatabaseProvider
  prisma: unknown
  providers?: {
    github?: SocialProviderCredentials
    google?: SocialProviderCredentials
  }
}

// Re-exported so consumers can type the auth instance without importing better-auth directly
export type { betterAuth as BetterAuth } from 'better-auth'