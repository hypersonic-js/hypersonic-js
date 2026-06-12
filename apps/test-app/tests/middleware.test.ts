import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response } from 'express'
import request from 'supertest'

import { createAuthGuard } from '../src/middleware.js'
import type { AuthLike, SessionUser } from '../src/types.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const testUser: SessionUser = { id: 'user-1', name: 'Alice', email: 'alice@example.com' }

function makeAuth(session: { user: SessionUser } | null): AuthLike {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(session),
    },
  }
}

/**
 * Builds a minimal Express app with one protected route that echoes
 * back the session user, so tests can assert req.sessionUser is set.
 */
function buildApp(auth: AuthLike) {
  const app = express()
  const requireAuth = createAuthGuard(auth)

  app.get('/protected', requireAuth, (req: Request, res: Response) => {
    // Cast needed because Express Request doesn't carry sessionUser by default
    const sessionUser = (req as Request & { sessionUser?: SessionUser }).sessionUser
    res.status(200).json({ sessionUser })
  })

  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createAuthGuard', () => {
  it('returns a RequestHandler function', () => {
    const guard = createAuthGuard(makeAuth(null))
    expect(typeof guard).toBe('function')
    // Express RequestHandler has arity 3 (req, res, next) or 4 for error
    expect(guard.length).toBe(3)
  })

  describe('when there is no session', () => {
    it('redirects to /login', async () => {
      const app = buildApp(makeAuth(null))
      const res = await request(app).get('/protected')
      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe('/login')
    })

    it('does not call next()', async () => {
      const auth = makeAuth(null)
      const nextSpy = vi.fn()
      const guard = createAuthGuard(auth)

      const fakeReq = { headers: {} } as Request
      const fakeRes = { redirect: vi.fn() } as unknown as Response

      await guard(fakeReq, fakeRes, nextSpy)

      expect(nextSpy).not.toHaveBeenCalled()
    })
  })

  describe('when a valid session exists', () => {
    it('calls next() to continue to the protected route', async () => {
      const app = buildApp(makeAuth({ user: testUser }))
      const res = await request(app).get('/protected')
      expect(res.status).toBe(200)
    })

    it('attaches session.user to req.sessionUser', async () => {
      const app = buildApp(makeAuth({ user: testUser }))
      const res = await request(app).get('/protected')
      expect(res.body.sessionUser).toMatchObject({
        id: testUser.id,
        name: testUser.name,
        email: testUser.email,
      })
    })
  })

  describe('auth.api.getSession call contract', () => {
    it('calls getSession with the request headers', async () => {
      const auth = makeAuth({ user: testUser })
      const app = buildApp(auth)

      await request(app).get('/protected').set('cookie', 'session=abc123')

      expect(auth.api.getSession).toHaveBeenCalledOnce()
      expect(auth.api.getSession).toHaveBeenCalledWith(
        expect.objectContaining({ headers: expect.anything() }),
      )
    })

    it('calls getSession exactly once per request', async () => {
      const auth = makeAuth({ user: testUser })
      const app = buildApp(auth)

      await request(app).get('/protected')
      await request(app).get('/protected')

      expect(auth.api.getSession).toHaveBeenCalledTimes(2)
    })
  })

  describe('multiple guard instances are independent', () => {
    it('two guards with different auths do not share state', async () => {
      const authWithSession = makeAuth({ user: testUser })
      const authNoSession = makeAuth(null)

      const appAllowed = buildApp(authWithSession)
      const appBlocked = buildApp(authNoSession)

      const allowedRes = await request(appAllowed).get('/protected')
      const blockedRes = await request(appBlocked).get('/protected')

      expect(allowedRes.status).toBe(200)
      expect(blockedRes.status).toBe(302)
    })
  })
})