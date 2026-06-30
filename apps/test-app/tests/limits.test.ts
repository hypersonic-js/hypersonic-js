/**
 * Integration tests for rate limiting on POST /posts.
 *
 * Exercises the real `@hypersonic-js/limits` package against real backends —
 * an in-process Map for memory, and a real Redis instance (started via
 * `docker compose up`, see docker-compose.yml) for redis. No stores, no
 * Redis client, and no rate limiter internals are mocked.
 *
 * Isolation
 * ─────────
 * Each test calls buildTestApp(..., { backend, options }) itself rather than
 * sharing one app from beforeAll. createLimiter() builds a brand-new limiter
 * per call, so for the memory backend a fresh app means a fresh, empty
 * in-process counter — no manual reset needed. The redis backend persists
 * its counters in the shared Redis database across app instances, so its
 * describe block additionally flushes the database after every test via a
 * separate, directly-connected redis client.
 *
 * Auth/CSRF credentials are obtained once in beforeAll from a throwaway
 * bootstrap app and reused across every test in this file — Credentials are
 * portable across app instances that share the same database and
 * BETTER_AUTH_SECRET (see getCredentials() in helpers/setup.ts).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import type { Application } from 'express'
import { createClient } from 'redis'
import type { LimitOptions } from '@hypersonic-js/limits'
import {
  buildTestApp,
  signUp,
  signIn,
  getCredentials,
  cleanDatabase,
  REDIS_URL,
} from './helpers/setup.js'
import type { TestApp, Credentials } from './helpers/setup.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

const LIMIT_OPTIONS: LimitOptions = { requests: 2, windowMs: 60_000, blockDuration: 300_000 }

/**
 * Intentionally short window + block so a test can wait out the block in
 * real time rather than mocking timers. windowMs is kept <= blockDuration
 * so the window counter has also reset by the time the block expires —
 * otherwise the next request would still be over its window limit and get
 * re-blocked immediately, even though the explicit block already lifted.
 */
const SHORT_LIMIT_OPTIONS: LimitOptions = { requests: 1, windowMs: 150, blockDuration: 200 }

/** Real (non-mocked) wait — long enough for SHORT_LIMIT_OPTIONS to fully expire. */
function waitForShortBlockToExpire(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300))
}

let bootstrapApp: TestApp
let credentials: Credentials

beforeAll(async () => {
  bootstrapApp = await buildTestApp()

  await signUp(bootstrapApp.express, {
    email: 'limits-user@test.com',
    name: 'Limits User',
    password: 'Password123!',
  })
  const sessionCookie = await signIn(
    bootstrapApp.express,
    'limits-user@test.com',
    'Password123!',
  )
  credentials = await getCredentials(bootstrapApp.express, sessionCookie)
})

afterAll(async () => {
  await cleanDatabase(bootstrapApp.prisma)
  await bootstrapApp.prisma.$disconnect()
})

/** Sends an authenticated, CSRF-valid POST /posts request. */
function createPost(app: Application) {
  return request(app)
    .post('/posts')
    .set('Cookie', credentials.cookie)
    .set('X-XSRF-TOKEN', credentials.csrfToken)
    .send({ title: 'Rate limit test', body: 'body' })
}

// ─── memory backend ───────────────────────────────────────────────────────────

describe('POST /posts rate limiting — memory backend', () => {
  let testApp: TestApp

  afterEach(async () => {
    await testApp.prisma.$disconnect()
  })

  it('allows requests up to the configured limit', async () => {
    testApp = await buildTestApp({}, { backend: 'memory', options: LIMIT_OPTIONS })

    const res1 = await createPost(testApp.express)
    const res2 = await createPost(testApp.express)

    expect(res1.status).toBe(302)
    expect(res2.status).toBe(302)
  })

  it('returns 429 with a message once the limit is exceeded', async () => {
    testApp = await buildTestApp({}, { backend: 'memory', options: LIMIT_OPTIONS })

    await createPost(testApp.express)
    await createPost(testApp.express)
    const res = await createPost(testApp.express)

    expect(res.status).toBe(429)
    expect(typeof res.body.message).toBe('string')
  })

  it('keeps rejecting requests immediately after the block is triggered', async () => {
    testApp = await buildTestApp({}, { backend: 'memory', options: LIMIT_OPTIONS })

    await createPost(testApp.express)
    await createPost(testApp.express)
    await createPost(testApp.express) // exceeds the limit and triggers the block

    const res = await createPost(testApp.express)
    expect(res.status).toBe(429)
  })

  it('allows requests again once the block duration expires', async () => {
    testApp = await buildTestApp({}, { backend: 'memory', options: SHORT_LIMIT_OPTIONS })

    await createPost(testApp.express) // 1st — within the limit
    const blockedRes = await createPost(testApp.express) // 2nd — exceeds limit, triggers block
    expect(blockedRes.status).toBe(429)

    await waitForShortBlockToExpire()

    const res = await createPost(testApp.express)
    expect(res.status).toBe(302)
  })
})

// ─── redis backend ────────────────────────────────────────────────────────────

describe('POST /posts rate limiting — redis backend', () => {
  let testApp: TestApp
  let redisClient: ReturnType<typeof createClient>

  beforeAll(async () => {
    redisClient = createClient({ url: REDIS_URL })
    await redisClient.connect()
  })

  afterAll(async () => {
    await redisClient.quit()
  })

  afterEach(async () => {
    await redisClient.flushDb()
    await testApp.prisma.$disconnect()
  })

  it('allows requests up to the configured limit', async () => {
    testApp = await buildTestApp({}, { backend: 'redis', options: LIMIT_OPTIONS })

    const res1 = await createPost(testApp.express)
    const res2 = await createPost(testApp.express)

    expect(res1.status).toBe(302)
    expect(res2.status).toBe(302)
  })

  it('returns 429 with a message once the limit is exceeded', async () => {
    testApp = await buildTestApp({}, { backend: 'redis', options: LIMIT_OPTIONS })

    await createPost(testApp.express)
    await createPost(testApp.express)
    const res = await createPost(testApp.express)

    expect(res.status).toBe(429)
    expect(typeof res.body.message).toBe('string')
  })

  it('keeps rejecting requests immediately after the block is triggered', async () => {
    testApp = await buildTestApp({}, { backend: 'redis', options: LIMIT_OPTIONS })

    await createPost(testApp.express)
    await createPost(testApp.express)
    await createPost(testApp.express) // exceeds the limit and triggers the block

    const res = await createPost(testApp.express)
    expect(res.status).toBe(429)
  })

  it('allows requests again once the block duration expires', async () => {
    testApp = await buildTestApp({}, { backend: 'redis', options: SHORT_LIMIT_OPTIONS })

    await createPost(testApp.express) // 1st — within the limit
    const blockedRes = await createPost(testApp.express) // 2nd — exceeds limit, triggers block
    expect(blockedRes.status).toBe(429)

    await waitForShortBlockToExpire()

    const res = await createPost(testApp.express)
    expect(res.status).toBe(302)
  })
})