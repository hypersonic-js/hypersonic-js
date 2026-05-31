import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins'
import type { AuthSetupOptions } from './types.js'

export type AuthInstance = ReturnType<typeof betterAuth>

/**
 * Creates and returns a configured Better Auth instance.
 * OAuth social providers are only wired in when credentials are supplied.
 */
export function createAuth(options: AuthSetupOptions): AuthInstance {
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {}

  if (options.providers?.github !== undefined) {
    socialProviders['github'] = options.providers.github
  }

  if (options.providers?.google !== undefined) {
    socialProviders['google'] = options.providers.google
  }

  const hasSocialProviders = Object.keys(socialProviders).length > 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authOptions: any = {
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    database: prismaAdapter(options.prisma as any, { provider: options.provider }),
    emailAndPassword: { enabled: true },
    plugins: [admin()],
  }

  if (hasSocialProviders) {
    authOptions.socialProviders = socialProviders
  }

  return betterAuth(authOptions) as AuthInstance
}