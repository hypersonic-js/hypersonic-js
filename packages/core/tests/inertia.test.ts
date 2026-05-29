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

async function buildTestApp(ssr = false, version = '1') {
  const app = express()
  await createInertiaMiddleware(app, { ssr, version })
  // Simple route that uses res.inertia()
  app.get('/test', (req, res) => {
    res.inertia!('TestPage', { user: 'Alice' })
  })
  return app
}

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

    it('escapes < > & \' in the page JSON to prevent XSS', async () => {
      const app = express()
      await createInertiaMiddleware(app, { ssr: false })
      app.get('/xss', (req, res) => {
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
      app.post('/data', (req, res) => {
        res.inertia!('Page', {})
      })
      const res = await request(app)
        .post('/data')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', 'v1')
      expect(res.status).toBe(200)
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
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/posts')
  })

  it('redirects to / when there is no Referer header', async () => {
    const app = buildErrorTestApp((next) => next(new NotFoundError()))
    const res = await request(app)
      .get('/fail')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/')
  })

  it('redirects to / when the Referer header is an empty string', async () => {
    const app = buildErrorTestApp((next) => next(new HttpError(401, 'Unauthorized')))
    const res = await request(app)
      .get('/fail')
      .set('X-Inertia', 'true')
      .set('Referer', '')
    expect(res.status).toBe(302)
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
    const res = await request(app)
      .get('/fail')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})