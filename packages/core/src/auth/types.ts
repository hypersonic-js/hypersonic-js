export interface SocialProviderCredentials {
  clientId: string
  clientSecret: string
}

export interface AuthSetupOptions {
  secret: string
  trustedOrigins: string[]
  databaseUrl: string
  prisma: unknown
  providers?: {
    github?: SocialProviderCredentials
    google?: SocialProviderCredentials
  }
}

// Re-exported so consumers can type the auth instance without importing better-auth directly
export type { betterAuth as BetterAuth } from 'better-auth'
