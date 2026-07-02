import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins'
import type { BetterAuthOptions } from 'better-auth'
import type { AuthSetupOptions } from './types.js'

export type AuthInstance = ReturnType<typeof betterAuth>

/**
 * Derived from prismaAdapter's first parameter — keeps this cast tied to
 * the adapter's own public API rather than to the wider `any` escape hatch.
 * The adapter declares its client as an empty interface so it accepts any
 * object; our `prisma: unknown` satisfies that at runtime.
 */
type PrismaAdapterClient = Parameters<typeof prismaAdapter>[0]

/**
 * Creates and returns a configured Better Auth instance.
 * OAuth social providers are only wired in when credentials are supplied.
 * The rateLimit option is only forwarded when explicitly provided, allowing
 * test environments to pass `{ enabled: false }` to suppress the in-process
 * rate limiter and avoid 429s across shared test suites.
 * The secondaryStorage option is forwarded when provided — the limits package
 * sets this automatically when the Redis backend is configured.
 *
 * Two targeted casts remain:
 *  - `prisma as PrismaAdapterClient`: our public API keeps `prisma: unknown`
 *    to stay agnostic of the generated PrismaClient types; the adapter's own
 *    PrismaClient is an empty interface so the cast is safe at runtime.
 *  - `socialProviders as BetterAuthOptions['socialProviders']`: our plain record
 *    satisfies the runtime contract but TypeScript cannot verify it against the
 *    `SocialProviders` mapped type without a cast.
 *
 * `rateLimit` and `secondaryStorage` no longer need casts: `AuthRateLimitOptions`
 * and `BetterAuthSecondaryStorage` (in ./types.js) are now type aliases of
 * Better Auth's own `BetterAuthRateLimitOptions` / `BetterAuthOptions['secondaryStorage']`,
 * so they're structurally identical to what `betterAuth()` expects, not just
 * compatible with it.
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

  const authOptions: BetterAuthOptions = {
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: prismaAdapter(options.prisma as PrismaAdapterClient, { provider: options.provider }),
    emailAndPassword: { enabled: true },
    plugins: [admin()],
  }

  if (hasSocialProviders) {
    authOptions.socialProviders = socialProviders as BetterAuthOptions['socialProviders']
  }

  if (options.rateLimit !== undefined) {
    authOptions.rateLimit = options.rateLimit
  }

  if (options.secondaryStorage !== undefined) {
    authOptions.secondaryStorage = options.secondaryStorage
  }

  return betterAuth(authOptions) as AuthInstance
}