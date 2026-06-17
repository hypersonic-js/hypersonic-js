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
import type { Application } from 'express'
import requestLib from 'supertest'
import type { Response as SupertestResponse } from 'supertest'
import { createApp, createDatabaseAdapter } from '@hypersonic-js/core'
import type { HypersonicApp, HypersonicConfig, Env } from '@hypersonic-js/core'
import { mountAdmin } from '@hypersonic-js/admin'
import type { AdminModelMeta, AdminOptions } from '@hypersonic-js/admin'
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type TestApp = HypersonicApp & { prisma: PrismaClient }

/** Cookie string (session + CSRF) and token value for mutation requests. */
export interface Credentials {
  /** Combined "session=…; XSRF-TOKEN=…" string for the Cookie header. */
  cookie: string
  /** Raw token value for the X-XSRF-TOKEN header. */
  csrfToken: string
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
 * Rate limiting is disabled so that multiple test suites running in the same
 * process do not exhaust Better Auth's in-memory per-IP counter and start
 * receiving 429 responses on sign-up.
 */
export async function buildTestApp(
  adminOptions: Partial<Omit<AdminOptions, 'meta' | 'auth'>> = {},
): Promise<TestApp> {
  const config: HypersonicConfig = {
    server: { port: 0, host: '127.0.0.1' },
    auth: {
      trustedOrigins: ['http://localhost', 'http://127.0.0.1'],
      rateLimit: { enabled: false },
    },
    inertia: { ssr: false },
    database: { provider: 'postgresql' },
  }

  const env: Env = { DATABASE_URL, BETTER_AUTH_SECRET }

  const adapter = await createDatabaseAdapter('postgresql', DATABASE_URL)
  const prisma = new PrismaClientCtor({ adapter }) as PrismaClient

  const app = await createApp({ config, env, prisma })

  registerRoutes(app.express, prisma as unknown as PrismaRouteClient, app.auth)

  mountAdmin(app.express, prisma, {
    meta: adminMeta,
    auth: app.auth,
    ...adminOptions,
  })

  return { ...app, prisma }
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