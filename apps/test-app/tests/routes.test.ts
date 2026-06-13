/**
 * Integration tests for the test-app routes.
 *
 * Uses a real Postgres database and real Better Auth sessions.
 * No Prisma delegates are mocked; no sessions are faked.
 *
 * CSRF: mutation requests (POST / DELETE) require both the XSRF-TOKEN cookie
 * and the X-XSRF-TOKEN header. Both are obtained via getCredentials() in
 * beforeAll and stored in the Credentials objects used throughout.
 *
 * Inertia: GET requests to Inertia pages are sent with X-Inertia: true so the
 * middleware returns assertable JSON ({ component, props, url, version })
 * rather than a full HTML page.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import {
  buildTestApp,
  signUp,
  signIn,
  getCredentials,
  cleanPosts,
  cleanDatabase,
} from './helpers/setup.js'
import type { TestApp, Credentials } from './helpers/setup.js'
import { parseId } from '../src/routes.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

let testApp: TestApp
let regularUser: { id: string; email: string }
let _otherUser: { id: string; email: string }
let userCredentials: Credentials
let otherCredentials: Credentials

beforeAll(async () => {
  testApp = await buildTestApp()

  const u1 = await signUp(testApp.express, {
    email: 'routes-user@test.com',
    name: 'Routes User',
    password: 'Password123!',
  })
  regularUser = u1.user
  userCredentials = await getCredentials(
    testApp.express,
    await signIn(testApp.express, 'routes-user@test.com', 'Password123!'),
  )

  const u2 = await signUp(testApp.express, {
    email: 'routes-other@test.com',
    name: 'Other User',
    password: 'Password123!',
  })
  _otherUser = u2.user
  otherCredentials = await getCredentials(
    testApp.express,
    await signIn(testApp.express, 'routes-other@test.com', 'Password123!'),
  )
})

beforeEach(async () => {
  await cleanPosts(testApp.prisma)
})

afterAll(async () => {
  await cleanDatabase(testApp.prisma)
  await testApp.prisma.$disconnect()
})

// ─── parseId unit tests ───────────────────────────────────────────────────────

describe('parseId', () => {
  it('parses a numeric string to an integer', () => {
    expect(parseId('42')).toBe(42)
  })

  it('returns NaN for a non-numeric string', () => {
    expect(isNaN(parseId('abc'))).toBe(true)
  })

  it('parses the first element of a string array', () => {
    expect(parseId(['7', '8'])).toBe(7)
  })

  it('returns NaN for an empty array', () => {
    expect(isNaN(parseId([]))).toBe(true)
  })

  it('returns NaN for undefined', () => {
    expect(isNaN(parseId(undefined))).toBe(true)
  })
})

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await request(testApp.express).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('redirects to /posts', async () => {
    const res = await request(testApp.express).get('/')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/posts')
  })
})

// ─── GET /login ───────────────────────────────────────────────────────────────

describe('GET /login', () => {
  it('renders the Auth/Login Inertia page', async () => {
    const res = await request(testApp.express)
      .get('/login')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Auth/Login')
  })
})

// ─── GET /register ────────────────────────────────────────────────────────────

describe('GET /register', () => {
  it('renders the Auth/Register Inertia page', async () => {
    const res = await request(testApp.express)
      .get('/register')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Auth/Register')
  })

  it('returns empty props', async () => {
    const res = await request(testApp.express)
      .get('/register')
      .set('X-Inertia', 'true')
    expect(res.body.props).toEqual({})
  })
})

// ─── auth guard ───────────────────────────────────────────────────────────────

describe('auth guard', () => {
  it('redirects to /login when there is no session cookie', async () => {
    const res = await request(testApp.express).get('/posts')
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('calls through to the route when a real session cookie is present', async () => {
    const res = await request(testApp.express)
      .get('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
  })
})

// ─── GET /posts ───────────────────────────────────────────────────────────────

describe('GET /posts', () => {
  it('renders Posts/Index with posts from the database', async () => {
    await testApp.prisma.post.create({
      data: { title: 'Hello World', body: 'First post', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .get('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-Inertia', 'true')

    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Posts/Index')
    expect(res.body.props.posts).toHaveLength(1)
    expect(res.body.props.posts[0].title).toBe('Hello World')
  })

  it('returns posts ordered by createdAt descending', async () => {
    await testApp.prisma.post.create({
      data: { title: 'First', body: 'body', userId: regularUser.id },
    })
    // Small delay to get distinct createdAt values
    await new Promise((r) => setTimeout(r, 10))
    await testApp.prisma.post.create({
      data: { title: 'Second', body: 'body', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .get('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-Inertia', 'true')

    const titles = (res.body.props.posts as Array<{ title: string }>).map((p) => p.title)
    expect(titles[0]).toBe('Second')
    expect(titles[1]).toBe('First')
  })

  it('includes the session user in the response props', async () => {
    const res = await request(testApp.express)
      .get('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-Inertia', 'true')

    expect(res.body.props.user).toMatchObject({ email: regularUser.email })
  })
})

// ─── GET /posts/:id ───────────────────────────────────────────────────────────

describe('GET /posts/:id', () => {
  it('returns 404 for a non-numeric id', async () => {
    const res = await request(testApp.express)
      .get('/posts/abc')
      .set('Cookie', userCredentials.cookie)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the post does not exist in the database', async () => {
    const res = await request(testApp.express)
      .get('/posts/999999')
      .set('Cookie', userCredentials.cookie)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })

  it('renders Posts/Show with the real post data', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Show Me', body: 'Post body', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .get(`/posts/${post.id}`)
      .set('Cookie', userCredentials.cookie)
      .set('X-Inertia', 'true')

    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Posts/Show')
    expect(res.body.props.post.id).toBe(post.id)
    expect(res.body.props.post.title).toBe('Show Me')
    expect(res.body.props.user).toMatchObject({ email: regularUser.email })
  })
})

// ─── POST /posts ──────────────────────────────────────────────────────────────

describe('POST /posts', () => {
  it('redirects to /login when unauthenticated', async () => {
    const res = await request(testApp.express)
      .post('/posts')
      .send({ title: 'Test', body: 'Body' })
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('creates a real post in the database', async () => {
    await request(testApp.express)
      .post('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
      .send({ title: 'My Post', body: 'My Body' })

    const post = await testApp.prisma.post.findFirst({ where: { title: 'My Post' } })
    expect(post).not.toBeNull()
    expect(post?.body).toBe('My Body')
  })

  it('redirects to /posts after creation', async () => {
    const res = await request(testApp.express)
      .post('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
      .send({ title: 'Redirect Test', body: 'body' })
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/posts')
  })

  it('assigns the post to the session user', async () => {
    await request(testApp.express)
      .post('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
      .send({ title: 'Owned Post', body: 'body' })

    const post = await testApp.prisma.post.findFirst({ where: { title: 'Owned Post' } })
    expect(post?.userId).toBe(regularUser.id)
  })

  it('falls back to empty strings for missing title and body', async () => {
    await request(testApp.express)
      .post('/posts')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
      .send({})

    const post = await testApp.prisma.post.findFirst({
      where: { userId: regularUser.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(post?.title).toBe('')
    expect(post?.body).toBe('')
  })
})

// ─── DELETE /posts/:id ────────────────────────────────────────────────────────

describe('DELETE /posts/:id', () => {
  it('redirects to /login when unauthenticated', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'To Delete', body: 'body', userId: regularUser.id },
    })
    const res = await request(testApp.express).delete(`/posts/${post.id}`)
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('/login')
  })

  it('returns 404 for a non-numeric id', async () => {
    const res = await request(testApp.express)
      .delete('/posts/abc')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the post does not exist in the database', async () => {
    const res = await request(testApp.express)
      .delete('/posts/999999')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })

  it('returns 401 when the session user does not own the post', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Owned by user', body: 'body', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .delete(`/posts/${post.id}`)
      .set('Cookie', otherCredentials.cookie)       // logged in as otherUser
      .set('X-XSRF-TOKEN', otherCredentials.csrfToken)
    expect(res.status).toBe(401)
  })

  it('deletes the post from the database', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Delete Me', body: 'body', userId: regularUser.id },
    })

    await request(testApp.express)
      .delete(`/posts/${post.id}`)
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)

    const gone = await testApp.prisma.post.findUnique({ where: { id: post.id } })
    expect(gone).toBeNull()
  })

  it('redirects to /posts after deletion', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Gone', body: 'body', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .delete(`/posts/${post.id}`)
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/posts')
  })

  it('redirects to the Referer on a 404 Inertia DELETE', async () => {
    const res = await request(testApp.express)
      .delete('/posts/999999')
      .set('Cookie', userCredentials.cookie)
      .set('X-XSRF-TOKEN', userCredentials.csrfToken)
      .set('X-Inertia', 'true')
      .set('Referer', '/posts')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/posts')
  })

  it('redirects to / on a 401 Inertia DELETE with no Referer', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Other Post', body: 'body', userId: regularUser.id },
    })

    const res = await request(testApp.express)
      .delete(`/posts/${post.id}`)
      .set('Cookie', otherCredentials.cookie)
      .set('X-XSRF-TOKEN', otherCredentials.csrfToken)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/')
  })
})

// ─── Error handler ────────────────────────────────────────────────────────────

describe('error handler', () => {
  it('returns 404 JSON for unknown post IDs on non-Inertia requests', async () => {
    const res = await request(testApp.express)
      .get('/posts/999999')
      .set('Cookie', userCredentials.cookie)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Post not found')
  })
})