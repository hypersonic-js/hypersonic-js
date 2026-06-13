/**
 * Integration tests for createAuthGuard.
 *
 * Uses a real Better Auth instance (from buildTestApp) and a real user session
 * obtained via sign-up → sign-in. No auth is mocked; getSession queries the
 * real Postgres session table on every call.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Request, Response } from 'express'
import request from 'supertest'
import { createAuthGuard } from '../src/middleware.js'
import type { SessionUser } from '../src/types.js'
import {
  buildTestApp,
  signUp,
  signIn,
  getCredentials,
  cleanDatabase,
} from './helpers/setup.js'
import type { TestApp, Credentials } from './helpers/setup.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

let testApp: TestApp
let userCredentials: Credentials

beforeAll(async () => {
  testApp = await buildTestApp()

  await signUp(testApp.express, {
    email: 'guard-user@test.com',
    name: 'Guard User',
    password: 'Password123!',
  })
  const sessionCookie = await signIn(testApp.express, 'guard-user@test.com', 'Password123!')
  userCredentials = await getCredentials(testApp.express, sessionCookie)
})

afterAll(async () => {
  await cleanDatabase(testApp.prisma)
  await testApp.prisma.$disconnect()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthRequest = Request & { sessionUser?: SessionUser }

/** Minimal Express app with one protected route that echoes back req.sessionUser. */
function buildGuardApp() {
  const app = express()
  const guard = createAuthGuard(testApp.auth)

  app.get('/protected', guard, (req: Request, res: Response) => {
    res.json({ sessionUser: (req as AuthRequest).sessionUser ?? null })
  })

  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createAuthGuard', () => {
  it('returns a RequestHandler function with arity 3', () => {
    const guard = createAuthGuard(testApp.auth)
    expect(typeof guard).toBe('function')
    expect(guard.length).toBe(3)
  })

  describe('when there is no session', () => {
    it('redirects to /login', async () => {
      const res = await request(buildGuardApp()).get('/protected')
      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe('/login')
    })

    it('does not call next()', async () => {
      const guard = createAuthGuard(testApp.auth)
      let nextWasCalled = false

      await guard(
        { headers: {} } as Request,
        { redirect: () => {} } as unknown as Response,
        () => { nextWasCalled = true },
      )

      expect(nextWasCalled).toBe(false)
    })
  })

  describe('when a valid session exists', () => {
    it('calls next() and returns 200', async () => {
      const res = await request(buildGuardApp())
        .get('/protected')
        .set('Cookie', userCredentials.cookie)
      expect(res.status).toBe(200)
    })

    it('attaches the real session user to req.sessionUser', async () => {
      const res = await request(buildGuardApp())
        .get('/protected')
        .set('Cookie', userCredentials.cookie)
      expect(res.body.sessionUser).toMatchObject({ email: 'guard-user@test.com' })
    })

    it('sessionUser carries the id, name, and email from the database', async () => {
      const res = await request(buildGuardApp())
        .get('/protected')
        .set('Cookie', userCredentials.cookie)
      const { sessionUser } = res.body
      expect(typeof sessionUser.id).toBe('string')
      expect(sessionUser.name).toBe('Guard User')
      expect(sessionUser.email).toBe('guard-user@test.com')
    })
  })

  describe('request isolation', () => {
    it('returns 302 for a request without a cookie even after a successful one', async () => {
      const app = buildGuardApp()
      const with_ = await request(app).get('/protected').set('Cookie', userCredentials.cookie)
      const without = await request(app).get('/protected')
      expect(with_.status).toBe(200)
      expect(without.status).toBe(302)
    })

    it('two guard instances using the same auth respond independently', async () => {
      const appA = buildGuardApp()
      const appB = buildGuardApp()

      const allowed = await request(appA).get('/protected').set('Cookie', userCredentials.cookie)
      const blocked = await request(appB).get('/protected')

      expect(allowed.status).toBe(200)
      expect(blocked.status).toBe(302)
    })
  })
})