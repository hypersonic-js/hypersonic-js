import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAdminAuthMiddleware } from '../../src/middleware/auth.js'
import type { AdminAuthLike } from '../../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAuth(sessionResult: { user: { role: string } } | null): AdminAuthLike {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(sessionResult),
    },
  }
}

function buildApp(auth: AdminAuthLike) {
  const app = express()
  const middleware = createAdminAuthMiddleware(auth)
  app.use('/protected', middleware, (_req, res) => {
    res.status(200).json({ ok: true })
  })
  return app
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createAdminAuthMiddleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls next() and allows the request when the user has the admin role', async () => {
    const app = buildApp(makeAuth({ user: { role: 'admin' } }))
    const res = await request(app).get('/protected')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 403 when there is no active session', async () => {
    const app = buildApp(makeAuth(null))
    const res = await request(app).get('/protected')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/no active session/)
  })

  it('returns 403 when the session user has role "user"', async () => {
    const app = buildApp(makeAuth({ user: { role: 'user' } }))
    const res = await request(app).get('/protected')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not an admin/)
  })

  it('returns 403 for any non-admin role string', async () => {
    const app = buildApp(makeAuth({ user: { role: 'moderator' } }))
    const res = await request(app).get('/protected')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not an admin/)
  })

  it('passes request headers to auth.api.getSession', async () => {
    const auth = makeAuth({ user: { role: 'admin' } })
    const app = buildApp(auth)
    await request(app).get('/protected').set('cookie', 'session=abc123')
    expect(auth.api.getSession).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
    )
  })

  it('is instantiated as a single RequestHandler function', () => {
    const middleware = createAdminAuthMiddleware(makeAuth(null))
    expect(typeof middleware).toBe('function')
    expect(middleware.length).toBe(3)
  })

  it('calls getSession exactly once per request', async () => {
    const auth = makeAuth({ user: { role: 'admin' } })
    const app = buildApp(auth)
    await request(app).get('/protected')
    await request(app).get('/protected')
    expect(auth.api.getSession).toHaveBeenCalledTimes(2)
  })
})