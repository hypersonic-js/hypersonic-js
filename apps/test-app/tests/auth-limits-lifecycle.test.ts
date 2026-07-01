/**
 * Integration test for Better Auth's redis-backed secondaryStorage lifecycle.
 *
 * When `config.limits = { backend: 'redis' }` and `auth.rateLimit.enabled` is
 * not forced to false, `createApp` wires Better Auth's own auth-endpoint rate
 * limiting to a dedicated Redis connection via `@hypersonic-js/limits`'s
 * `buildRedisAuthStorage` (see packages/limits/src/auth-storage.ts). That
 * connection is entirely internal to `createApp` — the only way to release
 * it is `app.stop()`.
 *
 * This suite exercises that path against the real Redis instance (no mocks):
 * sign up a user so the secondaryStorage get/set path is exercised for real,
 * then call testApp.stop() and assert it resolves without hanging or
 * throwing. Deep assertions on the underlying client's socket state aren't
 * possible from here since the client is never exposed outside createApp —
 * the assertion that `client.quit()` is actually invoked lives in
 * packages/limits/tests/auth-storage.test.ts (mocked). This suite's role is
 * to prove the wiring end-to-end and confirm shutdown is graceful.
 *
 * Better Auth's real rate limiter is active in this mode (see
 * buildTestApp's authRedisLimits parameter), so each test here signs up only
 * one user to stay well under any reasonable rate-limit threshold.
 */
import { describe, it, expect } from 'vitest'
import { buildTestApp, signUp, cleanDatabase } from './helpers/setup.js'

describe('Better Auth redis secondaryStorage lifecycle', () => {
  it('wires a working Better Auth session flow through the redis secondaryStorage', async () => {
    const testApp = await buildTestApp({}, undefined, true)
    try {
      const { user } = await signUp(testApp.express, {
        email: 'auth-limits-user@test.com',
        name: 'Auth Limits User',
        password: 'Password123!',
      })
      expect(user.email).toBe('auth-limits-user@test.com')
    } finally {
      await cleanDatabase(testApp.prisma)
      await testApp.stop()
    }
  })

  it('stop() closes the redis secondaryStorage connection without throwing or hanging', async () => {
    const testApp = await buildTestApp({}, undefined, true)
    try {
      await signUp(testApp.express, {
        email: 'auth-limits-stop@test.com',
        name: 'Auth Limits Stop',
        password: 'Password123!',
      })
    } finally {
      await cleanDatabase(testApp.prisma)
    }

    await expect(testApp.stop()).resolves.toBeUndefined()
  })
})