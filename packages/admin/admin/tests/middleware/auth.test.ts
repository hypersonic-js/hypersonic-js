import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAdminAuthMiddleware } from '../../src/middleware/auth.js'
import type { AdminAuthLike } from '../../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ['admin@example.com', 'owner@example.com']

function makeAuth(sessionResult: { user: { email: string } } | null): AdminAuthLike {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(sessionResult),
    },
  }
}

function buildApp(auth: AdminAuthLike) {
  const app = express()
  const middleware = createAdminAuthMiddleware(auth, ADMIN_EMAILS)
  app.use('/protected', middleware, (_req, res) => {
    res.status(200).json({ ok: true })
  })
  return app
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createAdminAuthMiddleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls next() and allows the request when the email is in the admin list', async () => {
    const auth = makeAuth({ user: { email: 'admin@example.com' } })
    const app = buildApp(auth)
    const res = await request(app).get('/protected')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('allows the second admin email in the allowlist', async () => {
    const auth = makeAuth({ user: { email: 'owner@example.com' } })
    const app = buildApp(auth)
    const res = await request(app).get('/protected')
    expect(res.status).toBe(200)
  })

  it('returns 403 when there is no active session', async () => {
    const auth = makeAuth(null)
    const app = buildApp(auth)
    const res = await request(app).get('/protected')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/no active session/)
  })

  it('returns 403 when the session email is not in the admin list', async () => {
    const auth = makeAuth({ user: { email: 'stranger@example.com' } })
    const app = buildApp(auth)
    const res = await request(app).get('/protected')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not an admin/)
  })

  it('passes request headers to auth.api.getSession', async () => {
    const auth = makeAuth({ user: { email: 'admin@example.com' } })
    const app = buildApp(auth)
    await request(app).get('/protected').set('cookie', 'session=abc123')
    expect(auth.api.getSession).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
    )
  })

  it('is instantiated as a single RequestHandler function', () => {
    const auth = makeAuth(null)
    const middleware = createAdminAuthMiddleware(auth, ADMIN_EMAILS)
    expect(typeof middleware).toBe('function')
  })
})
