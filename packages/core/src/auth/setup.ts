import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import type { BetterAuthOptions } from 'better-auth'
import type { SocialProviders } from 'better-auth/social-providers'
import { detectProvider } from '../utils/detect-provider.js'
import type { AuthSetupOptions } from './types.js'

export type AuthInstance = ReturnType<typeof betterAuth>

/**
 * Creates and returns a configured Better Auth instance.
 * OAuth social providers are only wired in when credentials are supplied.
 */
export function createAuth(options: AuthSetupOptions): AuthInstance {
  const provider = detectProvider(options.databaseUrl)

  const socialProviders: SocialProviders = {}

  if (options.providers?.github !== undefined) {
    socialProviders.github = options.providers.github as SocialProviders['github']
  }

  if (options.providers?.google !== undefined) {
    socialProviders.google = options.providers.google as SocialProviders['google']
  }

  const hasSocialProviders = Object.keys(socialProviders).length > 0

  const authOptions: BetterAuthOptions = {
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: prismaAdapter(
      options.prisma as Parameters<typeof prismaAdapter>[0],
      { provider },
    ),
    emailAndPassword: { enabled: true },
    ...(hasSocialProviders ? { socialProviders } : {}),
  }

  return betterAuth(authOptions)
}