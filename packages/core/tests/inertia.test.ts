import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

// Mock Vite setup so no real Vite server is started
vi.mock('../src/inertia/vite.js', () => ({
  createViteSetup: vi.fn(async () => ({
    middleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    assetTags: () => '<script type="module" src="/app.js"></script>',
  })),
}))

import { createInertiaMiddleware, createInertiaErrorHandler } from '../src/inertia/middleware.js'
import { createViteSetup } from '../src/inertia/vite.js'
import { HttpError, NotFoundError } from '../src/utils/errors.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildTestApp(ssr = false, version = '1') {
  const app = express()
  await createInertiaMiddleware(app, { ssr, version })
  app.get('/test', (_req, res) => {
    res.inertia!('TestPage', { user: 'Alice' })
  })
  return app
}

/**
 * App with POST / PATCH / DELETE mutation routes for CSRF tests.
 */
async function buildCsrfTestApp() {
  const app = express()
  await createInertiaMiddleware(app, { ssr: false })
  app.get('/test', (_req, res) => res.status(200).json({ ok: true }))
  app.post('/mutate', (_req, res) => res.status(200).json({ ok: true }))
  app.put('/mutate', (_req, res) => res.status(200).json({ ok: true }))
  app.patch('/mutate/:id', (_req, res) => res.status(200).json({ ok: true }))
  app.delete('/mutate/:id', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

/**
 * Extracts the XSRF-TOKEN value from a supertest response's Set-Cookie header.
 * Returns an empty string when the header is absent (token was not rotated).
 */
function extractCsrfToken(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? []
  const entry = cookies.find((c) => c.startsWith('XSRF-TOKEN='))
  return entry?.split(';')[0]?.split('=')[1] ?? ''
}

// ── createInertiaMiddleware ───────────────────────────────────────────────────

describe('createInertiaMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls createViteSetup with the ssr flag', async () => {
    await buildTestApp(true)
    expect(createViteSetup).toHaveBeenCalledWith(true)
  })

  describe('initial (non-Inertia) request', () => {
    it('returns HTML with the page data embedded', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(res.text).toContain('<!DOCTYPE html>')
      expect(res.text).toContain('id="app"')
      expect(res.text).toContain('data-page=')
    })

    it('embeds the correct component name in the page JSON', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      expect(res.text).toContain('"component":"TestPage"')
    })

    it('embeds the props in the page JSON', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      expect(res.text).toContain('"user":"Alice"')
    })

    it('embeds the asset tags in the HTML head', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      expect(res.text).toContain('<script type="module" src="/app.js"></script>')
    })

    it("escapes < > & ' in the page JSON to prevent XSS", async () => {
      const app = express()
      await createInertiaMiddleware(app, { ssr: false })
      app.get('/xss', (_req, res) => {
        res.inertia!('Page', { value: '<script>alert("xss")</script>' })
      })
      const res = await request(app).get('/xss')
      expect(res.text).not.toContain('<script>alert')
      expect(res.text).toContain('\\u003cscript\\u003e')
    })
  })

  describe('Inertia XHR request (X-Inertia header present)', () => {
    it('returns JSON with the page object', async () => {
      const app = await buildTestApp()
      const res = await request(app)
        .get('/test')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', '1')
      expect(res.status).toBe(200)
      expect(res.headers['x-inertia']).toBe('true')
      expect(res.headers['vary']).toContain('X-Inertia')
      expect(res.body.component).toBe('TestPage')
      expect(res.body.props).toEqual({ user: 'Alice' })
    })

    it('includes the request URL in the page object', async () => {
      const app = await buildTestApp()
      const res = await request(app)
        .get('/test')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', '1')
      expect(res.body.url).toBe('/test')
    })

    it('includes the asset version in the page object', async () => {
      const app = await buildTestApp(false, 'abc123')
      const res = await request(app)
        .get('/test')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', 'abc123')
      expect(res.body.version).toBe('abc123')
    })
  })

  describe('asset version mismatch', () => {
    it('returns 409 with X-Inertia-Location on version mismatch', async () => {
      const app = await buildTestApp(false, 'v2')
      const res = await request(app)
        .get('/test')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', 'v1') // stale version
      expect(res.status).toBe(409)
      expect(res.headers['x-inertia-location']).toBe('/test')
    })

    it('does not trigger version mismatch on non-GET requests', async () => {
      const app = express()
      await createInertiaMiddleware(app, { ssr: false, version: 'v2' })
      app.post('/data', (_req, res) => {
        res.inertia!('Page', {})
      })
      // Must include a valid CSRF token pair on mutation requests
      const token = 'a'.repeat(64)
      const res = await request(app)
        .post('/data')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', 'v1')
      expect(res.status).toBe(200)
    })
  })

  // ── CSRF protection ─────────────────────────────────────────────────────────

  describe('CSRF — XSRF-TOKEN cookie', () => {
    it('sets the XSRF-TOKEN cookie on GET responses when none is present', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      const cookies = res.headers['set-cookie'] as string[]
      expect(cookies.some((c) => c.startsWith('XSRF-TOKEN='))).toBe(true)
    })

    it('does not rotate the XSRF-TOKEN cookie when one is already present in the request', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
      const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? []
      expect(cookies.some((c) => c.startsWith('XSRF-TOKEN='))).toBe(false)
    })

    it('cookie is NOT HttpOnly so the Inertia JS client can read it', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      const cookies = res.headers['set-cookie'] as string[]
      const entry = cookies.find((c) => c.startsWith('XSRF-TOKEN='))
      expect(entry?.toLowerCase()).not.toContain('httponly')
    })

    it('cookie has SameSite=Strict', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      const cookies = res.headers['set-cookie'] as string[]
      const entry = cookies.find((c) => c.startsWith('XSRF-TOKEN='))
      expect(entry?.toLowerCase()).toContain('samesite=strict')
    })

    it('cookie has Path=/', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      const cookies = res.headers['set-cookie'] as string[]
      const entry = cookies.find((c) => c.startsWith('XSRF-TOKEN='))
      expect(entry?.toLowerCase()).toContain('path=/')
    })

    it('cookie value is a 64-character hex string', async () => {
      const app = await buildTestApp()
      const res = await request(app).get('/test')
      const token = extractCsrfToken(res)
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('generates a unique token for each new session without an existing cookie', async () => {
      const app = await buildTestApp()
      const res1 = await request(app).get('/test')
      const res2 = await request(app).get('/test')
      expect(extractCsrfToken(res1)).not.toBe(extractCsrfToken(res2))
    })
  })

  describe('CSRF — validation on mutation methods', () => {
    it('allows POST when X-XSRF-TOKEN header matches XSRF-TOKEN cookie', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
      expect(res.status).toBe(200)
    })

    it('rejects POST with no CSRF cookie with 419', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .post('/mutate')
        .set('X-XSRF-TOKEN', 'sometoken')
      expect(res.status).toBe(419)
      expect(res.body.error).toMatch(/csrf/i)
    })

    it('rejects POST with no CSRF header with 419', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', `XSRF-TOKEN=${token}`)
      expect(res.status).toBe(419)
    })

    it('rejects POST when header does not match cookie with 419', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', 'XSRF-TOKEN=aaaaaa')
        .set('X-XSRF-TOKEN', 'bbbbbb')
      expect(res.status).toBe(419)
    })

    it('allows PUT when tokens match', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .put('/mutate')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
      expect(res.status).toBe(200)
    })

    it('rejects PUT when tokens do not match with 419', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .put('/mutate')
        .set('Cookie', 'XSRF-TOKEN=aaaaaa')
        .set('X-XSRF-TOKEN', 'bbbbbb')
      expect(res.status).toBe(419)
    })

    it('allows PATCH when tokens match', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .patch('/mutate/1')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
      expect(res.status).toBe(200)
    })

    it('rejects PATCH when tokens do not match with 419', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .patch('/mutate/1')
        .set('Cookie', 'XSRF-TOKEN=aaaaaa')
        .set('X-XSRF-TOKEN', 'bbbbbb')
      expect(res.status).toBe(419)
    })

    it('allows DELETE when tokens match', async () => {
      const app = await buildCsrfTestApp()
      const token = 'a'.repeat(64)
      const res = await request(app)
        .delete('/mutate/1')
        .set('Cookie', `XSRF-TOKEN=${token}`)
        .set('X-XSRF-TOKEN', token)
      expect(res.status).toBe(200)
    })

    it('rejects DELETE when tokens do not match with 419', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .delete('/mutate/1')
        .set('Cookie', 'XSRF-TOKEN=aaaaaa')
        .set('X-XSRF-TOKEN', 'bbbbbb')
      expect(res.status).toBe(419)
    })

    it('does not validate GET requests', async () => {
      const app = await buildCsrfTestApp()
      // No CSRF token at all — GET must pass through
      const res = await request(app).get('/test')
      expect(res.status).toBe(200)
    })
  })

  describe('CSRF — cookie parsing robustness', () => {
    it('does not throw when a non-CSRF cookie contains malformed percent-encoding', async () => {
      const app = await buildTestApp()
      // %ZZ is invalid; without try/catch this would have thrown URIError
      const res = await request(app)
        .get('/test')
        .set('Cookie', 'other=%ZZ')
      expect(res.status).toBe(200)
    })

    it('falls back to the raw value when the CSRF cookie has malformed percent-encoding', async () => {
      const app = await buildCsrfTestApp()
      // Both cookie and header carry the same malformed raw value — should pass
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', 'XSRF-TOKEN=%ZZ')
        .set('X-XSRF-TOKEN', '%ZZ')
      expect(res.status).toBe(200)
    })

    it('rejects POST with 419 when malformed CSRF cookie does not match the header', async () => {
      const app = await buildCsrfTestApp()
      const res = await request(app)
        .post('/mutate')
        .set('Cookie', 'XSRF-TOKEN=%ZZ')
        .set('X-XSRF-TOKEN', 'different')
      expect(res.status).toBe(419)
    })
  })
})

// ─── createInertiaErrorHandler ───────────────────────────────────────────────

/**
 * Builds a minimal Express app with an error-throwing route, the Inertia
 * error handler, and a plain-JSON fallback — mirroring how routes.ts wires
 * things up in the test app.
 */
function buildErrorTestApp(throwFn: (next: NextFunction) => void) {
  const app = express()
  app.get('/fail', (_req, _res, next) => throwFn(next))
  app.use(createInertiaErrorHandler())
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Internal Server Error' })
  })
  return app
}

describe('createInertiaErrorHandler', () => {
  it('redirects to the Referer when an Inertia request throws an HttpError', async () => {
    const app = buildErrorTestApp((next) => next(new NotFoundError('Post not found')))
    const res = await request(app)
      .get('/fail')
      .set('X-Inertia', 'true')
      .set('Referer', '/posts')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/posts')
  })

  it('redirects to / when there is no Referer header', async () => {
    const app = buildErrorTestApp((next) => next(new NotFoundError()))
    const res = await request(app).get('/fail').set('X-Inertia', 'true')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/')
  })

  it('redirects to / when the Referer header is an empty string', async () => {
    const app = buildErrorTestApp((next) => next(new HttpError(401, 'Unauthorized')))
    const res = await request(app)
      .get('/fail')
      .set('X-Inertia', 'true')
      .set('Referer', '')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/')
  })

  it('passes HttpErrors through to the next handler for non-Inertia requests', async () => {
    const app = buildErrorTestApp((next) => next(new NotFoundError('Post not found')))
    const res = await request(app).get('/fail')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })

  it('passes non-HttpErrors through even for Inertia requests', async () => {
    const app = buildErrorTestApp((next) => next(new Error('DB exploded')))
    const res = await request(app).get('/fail').set('X-Inertia', 'true')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})