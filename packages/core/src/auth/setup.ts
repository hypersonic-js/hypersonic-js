import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { detectProvider } from '../utils/detect-provider.js'
import type { AuthSetupOptions } from './types.js'

export type AuthInstance = ReturnType<typeof betterAuth>

/**
 * Creates and returns a configured Better Auth instance.
 * OAuth social providers are only wired in when credentials are supplied.
 *
 * We use two `as unknown as` casts here:
 *  - `prisma` is typed as `unknown` in our public API to stay agnostic of the
 *    generated PrismaClient types; the runtime value is always a real PrismaClient.
 *  - `socialProviders` is built as a plain record and cast to Better Auth's
 *    `SocialProviders`; the runtime shape satisfies the contract.
 */
export function createAuth(options: AuthSetupOptions): AuthInstance {
  const provider = detectProvider(options.databaseUrl)

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
    database: prismaAdapter(options.prisma as any, { provider }),
    emailAndPassword: { enabled: true },
  }

  if (hasSocialProviders) {
    authOptions.socialProviders = socialProviders
  }

  return betterAuth(authOptions) as AuthInstance
}
