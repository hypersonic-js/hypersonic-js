import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { AuthInstance } from '../src/auth/setup.js'

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => vi.fn((_req: unknown, res: { end: () => void }) => res.end())),
}))

import { toNodeHandler } from 'better-auth/node'
import { mountAuth } from '../src/auth/middleware.js'

const mockAuth = { handler: vi.fn() } as unknown as AuthInstance

describe('mountAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the Better Auth Node handler from the given auth instance', () => {
    const app = express()
    mountAuth(app, mockAuth)
    expect(toNodeHandler).toHaveBeenCalledWith(mockAuth)
  })

  it('mounts the handler on all /api/auth/* routes', async () => {
    const app = express()
    mountAuth(app, mockAuth)
    const res = await request(app).get('/api/auth/session')
    expect(res.status).toBe(200)
  })

  it('does not intercept routes outside /api/auth', async () => {
    const app = express()
    mountAuth(app, mockAuth)
    app.get('/other', (_req, res) => res.status(200).json({ ok: true }))
    const res = await request(app).get('/other')
    expect(res.body).toEqual({ ok: true })
  })
})