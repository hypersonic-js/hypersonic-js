import { describe, it, expectTypeOf } from 'vitest'
import type { BetterAuthOptions, BetterAuthRateLimitOptions, BetterAuthRateLimitStorage } from 'better-auth'
import type {
  AuthRateLimitOptions,
  BetterAuthCustomStorage,
  BetterAuthSecondaryStorage,
} from '../src/auth/types.js'

/**
 * These are compile-time-only assertions — `expectTypeOf` performs no
 * runtime check, so a type mismatch here surfaces as a TypeScript error on
 * this file (caught by `tsc --noEmit` / the repo's typecheck step), not as
 * a failing `it()` at runtime.
 *
 * Their purpose is to guard against regression: `AuthRateLimitOptions`,
 * `BetterAuthSecondaryStorage`, and `BetterAuthCustomStorage` must stay
 * exact aliases of Better Auth's own types. If someone later "simplifies"
 * one of these back into a hand-rolled interface, these assertions fail to
 * compile — reproducing the exact class of bug this fix addresses.
 */
describe('auth type aliases stay identical to Better Auth upstream types', () => {
  it('AuthRateLimitOptions is exactly BetterAuthRateLimitOptions', () => {
    expectTypeOf<AuthRateLimitOptions>().toEqualTypeOf<BetterAuthRateLimitOptions>()
  })

  it('BetterAuthCustomStorage is exactly BetterAuthRateLimitStorage', () => {
    expectTypeOf<BetterAuthCustomStorage>().toEqualTypeOf<BetterAuthRateLimitStorage>()
  })

  it('BetterAuthSecondaryStorage is exactly BetterAuthOptions["secondaryStorage"] (minus undefined)', () => {
    expectTypeOf<BetterAuthSecondaryStorage>().toEqualTypeOf<
      NonNullable<BetterAuthOptions['secondaryStorage']>
    >()
  })

  it('AuthSetupOptions.rateLimit is not restricted to enabled/storage/customStorage only', () => {
    // A structural sanity check independent of the alias assertions above:
    // the real type must accept fields the old hand-rolled interface didn't.
    expectTypeOf<AuthRateLimitOptions>().toHaveProperty('window')
    expectTypeOf<AuthRateLimitOptions>().toHaveProperty('max')
    expectTypeOf<AuthRateLimitOptions>().toHaveProperty('customRules')
    expectTypeOf<AuthRateLimitOptions>().toHaveProperty('modelName')
  })
})