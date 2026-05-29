import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

import { registerRoutes, parseId } from '../src/routes.js'
import type { PrismaRouteClient, AuthLike, SessionUser } from '../src/types.js'

// ─── parseId unit tests ────────────────────────────────────────────────────

describe('parseId', () => {
  it('parses a numeric string to an integer', () => {
    expect(parseId('42')).toBe(42)
  })

  it('returns NaN for a non-numeric string', () => {
    expect(isNaN(parseId('abc'))).toBe(true)
  })

  it('parses the first element when given a string array', () => {
    expect(parseId(['7', '8'])).toBe(7)
  })

  it('returns NaN when given an empty array', () => {
    expect(isNaN(parseId([]))).toBe(true)
  })

  it('returns NaN for undefined', () => {
    expect(isNaN(parseId(undefined))).toBe(true)
  })
})

// ─── Test fixtures ────────────────────────────────────────────────────────────

const testUser: SessionUser = { id: 'user-1', name: 'Alice', email: 'alice@example.com' }
const otherUser: SessionUser = { id: 'user-2', name: 'Bob', email: 'bob@example.com' }

const testPost = {
  id: 1,
  title: 'Hello world',
  body: 'First post body',
  userId: 'user-1',
  user: { id: 'user-1', name: 'Alice' },
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockAuth: { api: { getSession: ReturnType<typeof vi.fn> } } = {
  api: { getSession: vi.fn() },
}

const mockPrisma = {
  post: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}

// ─── Test app factory ─────────────────────────────────────────────────────────

function buildApp(sessionUser: SessionUser | null = null) {
  mockAuth.api.getSession.mockResolvedValue(
    sessionUser ? { user: sessionUser } : null,
  )

  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Stub res.inertia so Inertia routes return assertable JSON in tests
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.inertia = (component: string, props: Record<string, unknown> = {}) => {
      res.json({ component, props })
    }
    next()
  })

  registerRoutes(app, mockPrisma as unknown as PrismaRouteClient, mockAuth as AuthLike)
  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(buildApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('GET /', () => {
  it('redirects to /posts', async () => {
    const res = await request(buildApp()).get('/')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/posts')
  })
})

describe('GET /login', () => {
  it('renders the Auth/Login Inertia page', async () => {
    const res = await request(buildApp()).get('/login')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Auth/Login')
  })
})

describe('GET /register', () => {
  it('renders the Auth/Register Inertia page', async () => {
    const res = await request(buildApp()).get('/register')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Auth/Register')
  })

  it('returns empty props', async () => {
    const res = await request(buildApp()).get('/register')
    expect(res.body.props).toEqual({})
  })
})

describe('auth guard', () => {
  it('redirects to /login when there is no session', async () => {
    const res = await request(buildApp(null)).get('/posts')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('calls through to the route when a session exists', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])
    const res = await request(buildApp(testUser)).get('/posts')
    expect(res.status).toBe(200)
  })
})

describe('GET /posts', () => {
  it('returns the Posts/Index page with posts and user', async () => {
    mockPrisma.post.findMany.mockResolvedValue([testPost])
    const res = await request(buildApp(testUser)).get('/posts')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Posts/Index')
    expect(res.body.props.posts).toHaveLength(1)
    expect(res.body.props.user.id).toBe(testUser.id)
  })

  it('queries posts ordered by createdAt descending', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])
    await request(buildApp(testUser)).get('/posts')
    expect(mockPrisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    )
  })
})

describe('GET /posts/:id', () => {
  it('returns 404 for a non-numeric id', async () => {
    const res = await request(buildApp(testUser)).get('/posts/abc')
    expect(res.status).toBe(404)
  })

  it('returns 404 when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    const res = await request(buildApp(testUser)).get('/posts/99')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })

  it('renders the Posts/Show page when the post exists', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(testPost)
    const res = await request(buildApp(testUser)).get('/posts/1')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Posts/Show')
    expect(res.body.props.post.id).toBe(1)
    expect(res.body.props.user.id).toBe(testUser.id)
  })

  it('returns 500 when the DB throws unexpectedly', async () => {
    mockPrisma.post.findUnique.mockRejectedValue(new Error('DB exploded'))
    const res = await request(buildApp(testUser)).get('/posts/1')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})

describe('POST /posts', () => {
  it('redirects to /login when unauthenticated', async () => {
    const res = await request(buildApp(null))
      .post('/posts')
      .send({ title: 'Test', body: 'Body' })
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('creates a post and redirects to /posts', async () => {
    mockPrisma.post.create.mockResolvedValue(testPost)
    const res = await request(buildApp(testUser))
      .post('/posts')
      .send({ title: 'Hello world', body: 'First post body' })
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/posts')
  })

  it('creates a post with the session user id', async () => {
    mockPrisma.post.create.mockResolvedValue(testPost)
    await request(buildApp(testUser))
      .post('/posts')
      .send({ title: 'Hello world', body: 'Body' })
    expect(mockPrisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: testUser.id }),
      }),
    )
  })

  it('falls back to empty strings for missing title and body', async () => {
    mockPrisma.post.create.mockResolvedValue(testPost)
    await request(buildApp(testUser)).post('/posts').send({})
    expect(mockPrisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: '', body: '' }),
      }),
    )
  })

  it('returns 500 when the DB throws unexpectedly', async () => {
    mockPrisma.post.create.mockRejectedValue(new Error('DB exploded'))
    const res = await request(buildApp(testUser))
      .post('/posts')
      .send({ title: 'Test', body: 'Body' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})

describe('DELETE /posts/:id', () => {
  it('redirects to /login when unauthenticated', async () => {
    const res = await request(buildApp(null)).delete('/posts/1')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('returns 404 for a non-numeric id', async () => {
    const res = await request(buildApp(testUser)).delete('/posts/abc')
    expect(res.status).toBe(404)
  })

  it('returns 404 when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    const res = await request(buildApp(testUser)).delete('/posts/99')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })

  it('returns 401 when the user does not own the post', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(testPost) // owned by user-1
    const res = await request(buildApp(otherUser)).delete('/posts/1') // logged in as user-2
    expect(res.status).toBe(401)
  })

  it('deletes the post and redirects to /posts', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(testPost)
    mockPrisma.post.delete.mockResolvedValue(testPost)
    const res = await request(buildApp(testUser)).delete('/posts/1')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/posts')
    expect(mockPrisma.post.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('redirects to Referer on 404 for an Inertia DELETE request', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    const res = await request(buildApp(testUser))
      .delete('/posts/99')
      .set('X-Inertia', 'true')
      .set('Referer', '/posts')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/posts')
  })

  it('redirects to / on 401 for an Inertia DELETE request with no Referer', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(testPost)
    const res = await request(buildApp(otherUser))
      .delete('/posts/1')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/')
  })

  it('returns 500 when the DB throws unexpectedly', async () => {
    mockPrisma.post.findUnique.mockRejectedValue(new Error('DB exploded'))
    const res = await request(buildApp(testUser)).delete('/posts/1')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})

describe('error handler', () => {
  it('returns 500 for unexpected errors', async () => {
    mockPrisma.post.findMany.mockRejectedValue(new Error('DB exploded'))
    const res = await request(buildApp(testUser)).get('/posts')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})