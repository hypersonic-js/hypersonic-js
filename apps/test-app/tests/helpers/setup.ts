/**
 * Shared integration-test helpers for the test-app.
 *
 * Every export here works against a real Postgres database. No Prisma delegates
 * are mocked; no auth sessions are faked. Each test file calls buildTestApp()
 * in beforeAll to get a fully wired HypersonicApp + PrismaClient, and calls
 * cleanDatabase() in afterAll followed by prisma.$disconnect().
 *
 * CSRF flow
 * ─────────
 * The Inertia middleware enforces CSRF on POST / PATCH / DELETE requests by
 * checking that the X-XSRF-TOKEN header matches the XSRF-TOKEN cookie. Auth
 * routes (/api/auth/*) are handled by Better Auth before the CSRF middleware
 * and are exempt. For everything else, call getCredentials() after sign-in to
 * receive a Credentials object that already includes the CSRF cookie and token
 * value — pass both on every mutation request.
 */
import { createRequire } from 'node:module'
import type { Application, RequestHandler } from 'express'
import requestLib from 'supertest'
import type { Response as SupertestResponse } from 'supertest'
import { createApp, createDatabaseAdapter } from '@hypersonic-js/core'
import type { HypersonicApp, HypersonicConfig, Env } from '@hypersonic-js/core'
import { mountAdmin } from '@hypersonic-js/admin'
import type { AdminModelMeta, AdminOptions, AdminAuthLike } from '@hypersonic-js/admin'
import { createLimiter, buildAuthLimitsConfig } from '@hypersonic-js/limits'
import type { LimitOptions, LimitsBackend } from '@hypersonic-js/limits'
import { registerRoutes } from '../../src/routes.js'
import type { PrismaRouteClient } from '../../src/types.js'
import type { PrismaClient } from '@prisma/client'

// PrismaClient is CJS — use createRequire to load it in an ESM context,
// matching the same pattern used in server.ts.
const _require = createRequire(import.meta.url)
const { PrismaClient: PrismaClientCtor } = _require('@prisma/client') as {
  PrismaClient: new (opts?: { adapter?: unknown }) => PrismaClient
}
const adminMeta = _require('../../prisma/admin-meta.json') as AdminModelMeta[]

// ── Constants ─────────────────────────────────────────────────────────────────

export const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://hypersonic:hypersonic@localhost:5432/hypersonic_test'

export const BETTER_AUTH_SECRET =
  process.env['BETTER_AUTH_SECRET'] ??
  'ci-test-secret-do-not-use-in-production-!!'

/**
 * Connection string for the Redis instance used by limits.test.ts and
 * auth-limits-lifecycle.test.ts. Points at a dedicated logical DB (index 1,
 * via the `/1` path segment) rather than the server default (DB 0) — both
 * suites call `flushDb()` between tests, which wipes every key in whichever
 * DB is selected. Using a dedicated index means that flush can never touch
 * unrelated keys on a shared local Redis instance or another db-0 consumer.
 */
export const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379/1'

/**
 * Window (seconds) used for `config.limits.window` when `authRedisLimits`
 * is true — passed through to `buildRedisAuthStorage` as the TTL on each
 * Redis-backed rate-limit record. 10s matches Better Auth's own default
 * `rateLimit.window`, and is short enough that leftover keys from a test
 * run don't linger meaningfully in the shared Redis instance.
 */
const AUTH_REDIS_LIMITS_WINDOW = 10

// ── Types ─────────────────────────────────────────────────────────────────────

export type TestApp = HypersonicApp & {
  prisma: PrismaClient
  /**
   * Releases the `POST /posts` rate limiter's resources (the Redis
   * connection, for the redis backend). Present only when `limits` was
   * passed to buildTestApp(); no-op backends still return a resolving
   * function. Call this in afterEach/afterAll alongside prisma teardown.
   */
  closeLimiter?: () => Promise<void>
}

/** Cookie string (session + CSRF) and token value for mutation requests. */
export interface Credentials {
  /** Combined "session=…; XSRF-TOKEN=…" string for the Cookie header. */
  cookie: string
  /** Raw token value for the X-XSRF-TOKEN header. */
  csrfToken: string
}

/**
 * Configures a real `@hypersonic-js/limits` rate limiter for `POST /posts`
 * in a single buildTestApp() call. Backend is restricted to memory and redis
 * — the two backends exercised by limits.test.ts.
 */
export interface TestLimitsOptions {
  backend: Extract<LimitsBackend, 'memory' | 'redis'>
  options: LimitOptions
}

// ── App factory ───────────────────────────────────────────────────────────────

/**
 * Creates a fully wired test app: real PrismaClient → real createApp →
 * real registerRoutes → real mountAdmin.
 *
 * Optional adminOptions are merged on top of the defaults (meta, auth) so
 * individual test files can exercise alternate configurations — custom prefix,
 * hiddenModels, logger, etc. — while still using the real DB and real auth.
 *
 * Optional `limits` builds a real `@hypersonic-js/limits` rate limiter
 * (memory or redis backend) via createLimiter and wires it onto `POST /posts`
 * only. Omit it to get the unthrottled route used by every other test file.
 * Each call builds a brand-new limiter, so calling buildTestApp() again is
 * the standard way to get a clean rate-limit counter for the memory backend.
 * The returned TestApp exposes `closeLimiter` to release it during teardown.
 *
 * Optional `authRedisLimits`, when true, sets `config.limits = { backend:
 * 'redis', window: AUTH_REDIS_LIMITS_WINDOW }`, leaves `auth.rateLimit`
 * unset (rather than the usual `{ enabled: false }`), and passes
 * `buildAuthLimitsConfig` as `createApp`'s `limitsPlugin` —
 * `createApp` never imports `@hypersonic-js/limits` itself, so this is how
 * Better Auth's own auth-endpoint rate limiting gets wired to a dedicated
 * Redis connection via `rateLimit.customStorage` (not `secondaryStorage` —
 * see `buildRedisAuthStorage` in `packages/limits/src/auth-storage.ts` for
 * why). This is for auth-limits-lifecycle.test.ts only — Better Auth's real
 * rate limiter is active in this mode, so keep request volume in that test
 * low.
 *
 * Rate limiting is disabled by default so that multiple test suites running
 * in the same process do not exhaust Better Auth's in-memory per-IP counter
 * and start receiving 429 responses on sign-up.
 */
export async function buildTestApp(
  adminOptions: Partial<Omit<AdminOptions, 'meta' | 'auth'>> = {},
  limits?: TestLimitsOptions,
  authRedisLimits?: boolean,
): Promise<TestApp> {
  const config: HypersonicConfig = {
    server: { port: 0, host: '127.0.0.1' },
    auth: {
      trustedOrigins: ['http://localhost', 'http://127.0.0.1'],
      // Omit rateLimit entirely (rather than set it to undefined) when
      // authRedisLimits is true, so createApp's `rateLimitOptions?.enabled
      // !== false` check sees it as unset and proceeds with limits wiring.
      ...(authRedisLimits === true ? {} : { rateLimit: { enabled: false } }),
    },
    inertia: { ssr: false },
    database: { provider: 'postgresql' },
    // Same reasoning — omit the key rather than assign undefined.
    ...(authRedisLimits === true
      ? { limits: { backend: 'redis' as const, window: AUTH_REDIS_LIMITS_WINDOW } }
      : {}),
  }

  const env: Env = { DATABASE_URL, BETTER_AUTH_SECRET, REDIS_URL }

  const adapter = await createDatabaseAdapter('postgresql', DATABASE_URL)
  const prisma = new PrismaClientCtor({ adapter }) as PrismaClient

  const app = await createApp({
    config,
    env,
    prisma,
    ...(authRedisLimits === true ? { limitsPlugin: buildAuthLimitsConfig } : {}),
  })

  let postsLimiter: RequestHandler | undefined
  let closeLimiter: (() => Promise<void>) | undefined
  if (limits) {
    const limiter = await createLimiter({
      config: { backend: limits.backend },
      env: { REDIS_URL },
    })
    postsLimiter = limiter.limit(limits.options)
    closeLimiter = limiter.close
  }

  registerRoutes(app.express, prisma as unknown as PrismaRouteClient, app.auth, { postsLimiter })

  // Auth<BetterAuthOptions> does not include `role` in its user type when the
  // admin plugin is not explicitly wired into the BetterAuth call, so TypeScript
  // cannot verify structural compatibility with AdminAuthLike after
  // better-auth@1.6.20 tightened its inference. At runtime the DB user row
  // always carries `role`, so the cast is safe.
  mountAdmin(app.express, prisma, {
    meta: adminMeta,
    auth: app.auth as AdminAuthLike,
    ...adminOptions,
  })

  return { ...app, prisma, closeLimiter }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Extracts "name=value" pairs from a set-cookie response header. */
export function extractCookie(res: SupertestResponse): string {
  const raw = res.headers['set-cookie'] as string[] | string | undefined
  if (!raw) throw new Error('No set-cookie header in response')
  const entries = Array.isArray(raw) ? raw : [raw]
  return entries.map((c) => c.split(';')[0]).join('; ')
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Signs up a new user via Better Auth and returns the user record + session cookie. */
export async function signUp(
  app: Application,
  opts: { email: string; name: string; password: string },
): Promise<{ user: { id: string; email: string; name: string }; sessionCookie: string }> {
  const res = await requestLib(app)
    .post('/api/auth/sign-up/email')
    .set('Origin', 'http://localhost')
    .send(opts)

  if (res.status !== 200) {
    throw new Error(`signUp failed (${res.status}): ${JSON.stringify(res.body)}`)
  }

  return {
    user: res.body.user as { id: string; email: string; name: string },
    sessionCookie: extractCookie(res),
  }
}

/** Signs in an existing user and returns the raw session cookie string. */
export async function signIn(
  app: Application,
  email: string,
  password: string,
): Promise<string> {
  const res = await requestLib(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', 'http://localhost')
    .send({ email, password })

  if (res.status !== 200) {
    throw new Error(`signIn failed (${res.status}): ${JSON.stringify(res.body)}`)
  }

  return extractCookie(res)
}

/**
 * Obtains a Credentials object suitable for mutation requests.
 *
 * Sends a GET to /health to trigger the Inertia CSRF setter, which writes the
 * XSRF-TOKEN cookie into the response. Returns a combined cookie string
 * (session + CSRF) and the raw token value for the X-XSRF-TOKEN header.
 *
 * Because CSRF validation is stateless (token-in-cookie == token-in-header),
 * Credentials obtained from one app instance work on any other instance that
 * shares the same database and BETTER_AUTH_SECRET.
 */
export async function getCredentials(
  app: Application,
  sessionCookie: string,
): Promise<Credentials> {
  const res = await requestLib(app).get('/health').set('Cookie', sessionCookie)

  const raw = res.headers['set-cookie'] as string[] | string | undefined
  if (!raw) return { cookie: sessionCookie, csrfToken: '' }

  const entries = Array.isArray(raw) ? raw : [raw]
  const csrfEntry = entries.find((c) => c.startsWith('XSRF-TOKEN='))
  if (!csrfEntry) return { cookie: sessionCookie, csrfToken: '' }

  const csrfPair = csrfEntry.split(';')[0]!              // "XSRF-TOKEN=abc123"
  const csrfToken = csrfPair.split('=').slice(1).join('=') // "abc123"

  return {
    cookie: `${sessionCookie}; ${csrfPair}`,
    csrfToken,
  }
}

// ── Database helpers ──────────────────────────────────────────────────────────

/** Promotes a user to admin role directly via Prisma. */
export async function setAdminRole(prisma: PrismaClient, email: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.user as any).update({ where: { email }, data: { role: 'admin' } })
}

/** Deletes all Post rows — cheap beforeEach isolation between route tests. */
export async function cleanPosts(prisma: PrismaClient): Promise<void> {
  await prisma.post.deleteMany()
}

/**
 * Truncates all application tables in FK-safe order.
 * Call in afterAll after every test file that writes to the DB.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.post.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.verification.deleteMany()
  await prisma.user.deleteMany()
}