/**
 * Integration tests for the Hypersonic admin dashboard.
 *
 * Uses a real Postgres database, real Better Auth sessions, and the real Better
 * Auth admin plugin (createUser / adminUpdateUser / removeUser). No Prisma
 * delegates are mocked; no sessions are faked.
 *
 * User lifecycle
 * ──────────────
 * adminUser and regularUser are created once in beforeAll via Better Auth
 * sign-up. adminUser is promoted to role "admin" via Prisma so that subsequent
 * sign-in returns an admin session. Posts are cleaned in beforeEach; users and
 * sessions persist across tests within the file.
 *
 * CSRF
 * ────
 * All mutation requests (POST / PATCH / DELETE) include the XSRF-TOKEN cookie
 * and X-XSRF-TOKEN header obtained from getCredentials(). For unauthenticated
 * mutation tests a synthetic matching token pair is constructed manually since
 * there is no session to derive one from — this passes CSRF validation and lets
 * the admin auth middleware return the expected 403.
 *
 * Inertia
 * ───────
 * GET requests to admin pages are sent with X-Inertia: true so the middleware
 * returns assertable JSON ({ component, props }) rather than a full HTML page.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import {
  buildTestApp,
  signUp,
  signIn,
  getCredentials,
  setAdminRole,
  cleanPosts,
  cleanDatabase,
} from './helpers/setup.js'
import type { TestApp, Credentials } from './helpers/setup.js'
import type { AdminOptions } from '@hypersonic-js/admin'

// ─── Setup ────────────────────────────────────────────────────────────────────

let testApp: TestApp
let adminUser: { id: string; email: string; name: string }
let regularUser: { id: string; email: string }
let adminCredentials: Credentials
let regularCredentials: Credentials

beforeAll(async () => {
  testApp = await buildTestApp()

  // Admin user: sign up, promote role, then sign in so getSession returns admin.
  const a = await signUp(testApp.express, {
    email: 'admin@test.com',
    name: 'Admin User',
    password: 'Password123!',
  })
  adminUser = a.user
  await setAdminRole(testApp.prisma, adminUser.email)
  adminCredentials = await getCredentials(
    testApp.express,
    await signIn(testApp.express, adminUser.email, 'Password123!'),
  )

  // Regular user: unprivileged, used for 403 enforcement tests.
  const r = await signUp(testApp.express, {
    email: 'regular@test.com',
    name: 'Regular User',
    password: 'Password123!',
  })
  regularUser = r.user
  regularCredentials = await getCredentials(
    testApp.express,
    await signIn(testApp.express, regularUser.email, 'Password123!'),
  )
})

beforeEach(async () => {
  await cleanPosts(testApp.prisma)
})

afterAll(async () => {
  await cleanDatabase(testApp.prisma)
  await testApp.prisma.$disconnect()
})

/**
 * A synthetic matching CSRF token pair for unauthenticated mutation tests.
 * Passes the CSRF validator (stateless: header == cookie) so the admin auth
 * middleware can produce the expected 403 rather than a 419.
 */
function unauthCsrfHeaders() {
  const token = 'synthetic-no-auth-csrf'
  return {
    'Cookie': `XSRF-TOKEN=${token}`,
    'X-XSRF-TOKEN': token,
  }
}

// ─── Authentication enforcement ───────────────────────────────────────────────

describe('authentication enforcement', () => {
  it('returns 403 when there is no active session', async () => {
    const res = await request(testApp.express).get('/admin').set('X-Inertia', 'true')
    expect(res.status).toBe(403)
  })

  it('returns 403 for a session with role "user"', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', regularCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(403)
  })

  it('allows access for a session with role "admin"', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
  })

  it('returns 403 for an unauthenticated POST mutation', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set(unauthCsrfHeaders())
      .send({ title: 'x', body: 'y', userId: adminUser.id })
    expect(res.status).toBe(403)
  })
})

// ─── GET /admin — dashboard ───────────────────────────────────────────────────

describe('GET /admin — dashboard', () => {
  it('renders the Admin/Dashboard component', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/Dashboard')
  })

  it('includes a models array in props', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(Array.isArray(res.body.props.models)).toBe(true)
  })

  it('shows the Post model in the dashboard', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
    expect(names).toContain('Post')
  })

  it('shows the User model in the dashboard', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
    expect(names).toContain('User')
  })

  it('hides Session by default (Better Auth internal table)', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
    expect(names).not.toContain('Session')
  })

  it('hides Account by default', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
    expect(names).not.toContain('Account')
  })

  it('hides Verification by default', async () => {
    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
    expect(names).not.toContain('Verification')
  })

  it('reflects real Post record counts from the database', async () => {
    await testApp.prisma.post.createMany({
      data: [
        { title: 'A', body: 'a', userId: adminUser.id },
        { title: 'B', body: 'b', userId: adminUser.id },
      ],
    })

    const res = await request(testApp.express)
      .get('/admin')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')

    const postModel = (
      res.body.props.models as Array<{ name: string; recordCount: number }>
    ).find((m) => m.name === 'Post')
    expect(postModel?.recordCount).toBe(2)
  })
})

// ─── showAuthModels option ────────────────────────────────────────────────────

describe('showAuthModels option', () => {
  it('shows Session when showAuthModels is true', async () => {
    const altApp = await buildTestApp({ showAuthModels: true })
    try {
      const res = await request(altApp.express)
        .get('/admin')
        .set('Cookie', adminCredentials.cookie)  // works cross-app — same DB + secret
        .set('X-Inertia', 'true')
      const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
      expect(names).toContain('Session')
    } finally {
      await altApp.prisma.$disconnect()
    }
  })
})

// ─── GET /admin/post ──────────────────────────────────────────────────────────

describe('GET /admin/post — Post model index', () => {
  it('renders the Admin/ModelIndex component', async () => {
    const res = await request(testApp.express)
      .get('/admin/post')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelIndex')
  })

  it('returns 403 for unauthenticated access', async () => {
    const res = await request(testApp.express)
      .get('/admin/post')
      .set('X-Inertia', 'true')
    expect(res.status).toBe(403)
  })
})

// ─── GET /admin/user ──────────────────────────────────────────────────────────

describe('GET /admin/user — User model index', () => {
  it('renders the Admin/ModelIndex component', async () => {
    const res = await request(testApp.express)
      .get('/admin/user')
      .set('Cookie', adminCredentials.cookie)
      .set('X-Inertia', 'true')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelIndex')
  })
})

// ─── POST /admin/post ─────────────────────────────────────────────────────────

describe('POST /admin/post — create post', () => {
  it('creates a real post record and redirects to the post list', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .send({ title: 'Admin Post', body: 'Post body', userId: adminUser.id })

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')

    const post = await testApp.prisma.post.findFirst({ where: { title: 'Admin Post' } })
    expect(post).not.toBeNull()
    expect(post?.body).toBe('Post body')
  })

  it('stores the submitted data correctly in the database', async () => {
    await request(testApp.express)
      .post('/admin/post')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .send({ title: 'Stored Title', body: 'Stored Body', userId: adminUser.id })

    const post = await testApp.prisma.post.findFirst({ where: { title: 'Stored Title' } })
    expect(post?.body).toBe('Stored Body')
    expect(post?.userId).toBe(adminUser.id)
  })

  it('returns 403 when unauthenticated', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set(unauthCsrfHeaders())
      .send({ title: 'x', body: 'y', userId: adminUser.id })
    expect(res.status).toBe(403)
  })

  it('returns 403 for a non-admin session', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set('Cookie', regularCredentials.cookie)
      .set('X-XSRF-TOKEN', regularCredentials.csrfToken)
      .send({ title: 'x', body: 'y', userId: regularUser.id })
    expect(res.status).toBe(403)
  })
})

// ─── PATCH /admin/post/:id ────────────────────────────────────────────────────

describe('PATCH /admin/post/:id — update post', () => {
  it('updates the post in the database and redirects to the post list', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Original Title', body: 'Original Body', userId: adminUser.id },
    })

    const res = await request(testApp.express)
      .patch(`/admin/post/${post.id}`)
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .send({ title: 'Updated Title' })

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')

    const updated = await testApp.prisma.post.findUnique({ where: { id: post.id } })
    expect(updated?.title).toBe('Updated Title')
  })

  it('returns 403 when unauthenticated', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Guarded', body: 'body', userId: adminUser.id },
    })
    const res = await request(testApp.express)
      .patch(`/admin/post/${post.id}`)
      .set(unauthCsrfHeaders())
      .send({ title: 'x' })
    expect(res.status).toBe(403)
  })
})

// ─── DELETE /admin/post/:id ───────────────────────────────────────────────────

describe('DELETE /admin/post/:id — delete post', () => {
  it('deletes the post from the database and redirects to the post list', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'To Delete', body: 'body', userId: adminUser.id },
    })

    const res = await request(testApp.express)
      .delete(`/admin/post/${post.id}`)
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')

    const gone = await testApp.prisma.post.findUnique({ where: { id: post.id } })
    expect(gone).toBeNull()
  })

  it('returns 403 when unauthenticated', async () => {
    const post = await testApp.prisma.post.create({
      data: { title: 'Protected', body: 'body', userId: adminUser.id },
    })
    const res = await request(testApp.express)
      .delete(`/admin/post/${post.id}`)
      .set(unauthCsrfHeaders())
    expect(res.status).toBe(403)
  })
})

// ─── POST /admin/user ─────────────────────────────────────────────────────────
//
// User mutations go through Better Auth's admin plugin (createUser /
// adminUpdateUser / removeUser) rather than Prisma directly.

describe('POST /admin/user — create user via Better Auth admin API', () => {
  it('creates a real user and redirects to the user list', async () => {
    const testEmail = 'admin-created@test.com'
    try {
      const res = await request(testApp.express)
        .post('/admin/user')
        .set('Cookie', adminCredentials.cookie)
        .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
        .send({ name: 'Created User', email: testEmail, password: 'Password123!', role: 'user' })

      expect(res.status).toBe(303)
      expect(res.headers['location']).toBe('/admin/user')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (testApp.prisma.user as any).findUnique({ where: { email: testEmail } })
      expect(user).not.toBeNull()
      expect(user?.name).toBe('Created User')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (testApp.prisma.user as any).deleteMany({ where: { email: testEmail } })
    }
  })

  it('returns 403 when unauthenticated', async () => {
    const res = await request(testApp.express)
      .post('/admin/user')
      .set(unauthCsrfHeaders())
      .send({ name: 'x', email: 'x@x.com', password: 'Password123!' })
    expect(res.status).toBe(403)
  })

  it('returns 403 for a non-admin session', async () => {
    const res = await request(testApp.express)
      .post('/admin/user')
      .set('Cookie', regularCredentials.cookie)
      .set('X-XSRF-TOKEN', regularCredentials.csrfToken)
      .send({ name: 'x', email: 'x2@x.com', password: 'Password123!' })
    expect(res.status).toBe(403)
  })
})

// ─── PATCH /admin/user/:id ────────────────────────────────────────────────────

describe('PATCH /admin/user/:id — update user via Better Auth adminUpdateUser', () => {
  it('updates the user record and redirects to the user list', async () => {
    // Create a user to update
    const { user: tempUser } = await signUp(testApp.express, {
      email: 'patch-user@test.com',
      name: 'Original Name',
      password: 'Password123!',
    })
    try {
      const res = await request(testApp.express)
        .patch(`/admin/user/${tempUser.id}`)
        .set('Cookie', adminCredentials.cookie)
        .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(303)
      expect(res.headers['location']).toBe('/admin/user')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await (testApp.prisma.user as any).findUnique({ where: { id: tempUser.id } })
      expect(updated?.name).toBe('Updated Name')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (testApp.prisma.session as any).deleteMany({ where: { userId: tempUser.id } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (testApp.prisma.user as any).deleteMany({ where: { id: tempUser.id } })
    }
  })

  it('returns 403 when unauthenticated', async () => {
    const res = await request(testApp.express)
      .patch(`/admin/user/${adminUser.id}`)
      .set(unauthCsrfHeaders())
      .send({ name: 'x' })
    expect(res.status).toBe(403)
  })
})

// ─── DELETE /admin/user/:id ───────────────────────────────────────────────────

describe('DELETE /admin/user/:id — delete user via Better Auth removeUser', () => {
  it('removes the user from the database and redirects to the user list', async () => {
    // Sign up a user to delete — ensures a proper Better Auth account exists.
    const { user: tempUser } = await signUp(testApp.express, {
      email: 'delete-user@test.com',
      name: 'Delete Me',
      password: 'Password123!',
    })

    const res = await request(testApp.express)
      .delete(`/admin/user/${tempUser.id}`)
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/user')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gone = await (testApp.prisma.user as any).findUnique({ where: { id: tempUser.id } })
    expect(gone).toBeNull()
  })

  it('returns 403 when unauthenticated', async () => {
    const res = await request(testApp.express)
      .delete(`/admin/user/${regularUser.id}`)
      .set(unauthCsrfHeaders())
    expect(res.status).toBe(403)
  })
})

// ─── Error handling — real database errors ────────────────────────────────────

describe('error handling — real database constraint violations', () => {
  it('redirects to Referer when post create fails (FK violation: non-existent userId)', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .set('X-Inertia', 'true')
      .set('Referer', '/admin/post/new')
      .send({ title: 'Bad Post', body: 'body', userId: 'non-existent-user-id' })

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post/new')
  })

  it('redirects to Referer when post update fails (P2025: record not found)', async () => {
    const res = await request(testApp.express)
      .patch('/admin/post/9999999')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .set('X-Inertia', 'true')
      .set('Referer', '/admin/post/9999999')
      .send({ title: 'Update Ghost' })

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post/9999999')
  })

  it('redirects to Referer when user create fails (unique constraint: duplicate email)', async () => {
    // adminUser.email already exists — this triggers a unique constraint violation.
    const res = await request(testApp.express)
      .post('/admin/user')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      .set('X-Inertia', 'true')
      .set('Referer', '/admin/user/new')
      .send({ name: 'Dup', email: adminUser.email, password: 'Password123!' })

    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/user/new')
  })

  it('calls logger.error when a mutation fails', async () => {
    const errorFn = vi.fn()
    const altApp = await buildTestApp({
      logger: { error: errorFn, warn: vi.fn(), info: vi.fn() },
    })

    try {
      // FK violation triggers the admin error handler which calls logger.error
      await request(altApp.express)
        .post('/admin/post')
        .set('Cookie', adminCredentials.cookie)   // valid cross-app (same DB + secret)
        .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
        .set('X-Inertia', 'true')
        .send({ title: 'Fail', body: 'x', userId: 'non-existent' })

      expect(errorFn).toHaveBeenCalledOnce()
    } finally {
      await altApp.prisma.$disconnect()
    }
  })

  it('returns 500 JSON for a mutation error on a non-Inertia request', async () => {
    const res = await request(testApp.express)
      .post('/admin/post')
      .set('Cookie', adminCredentials.cookie)
      .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
      // No X-Inertia header — error handler returns JSON
      .send({ title: 'Bad', body: 'x', userId: 'non-existent-user' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})

// ─── Custom prefix ────────────────────────────────────────────────────────────

describe('custom prefix', () => {
  it('mounts at /cms and returns 404 for /admin', async () => {
    const altApp = await buildTestApp({ prefix: '/cms' })
    try {
      const adminRes = await request(altApp.express)
        .get('/admin')
        .set('Cookie', adminCredentials.cookie)
        .set('X-Inertia', 'true')
      const cmsRes = await request(altApp.express)
        .get('/cms')
        .set('Cookie', adminCredentials.cookie)
        .set('X-Inertia', 'true')

      expect(adminRes.status).toBe(404)
      expect(cmsRes.status).toBe(200)
    } finally {
      await altApp.prisma.$disconnect()
    }
  })

  it('renders Admin/Dashboard at the custom prefix', async () => {
    const altApp = await buildTestApp({ prefix: '/cms' })
    try {
      const res = await request(altApp.express)
        .get('/cms')
        .set('Cookie', adminCredentials.cookie)
        .set('X-Inertia', 'true')
      expect(res.body.component).toBe('Admin/Dashboard')
    } finally {
      await altApp.prisma.$disconnect()
    }
  })

  it('POST at custom prefix creates a real record in the database', async () => {
    const altApp = await buildTestApp({ prefix: '/cms' })
    try {
      const res = await request(altApp.express)
        .post('/cms/post')
        .set('Cookie', adminCredentials.cookie)
        .set('X-XSRF-TOKEN', adminCredentials.csrfToken)
        .send({ title: 'CMS Post', body: 'Content', userId: adminUser.id })

      expect(res.status).toBe(303)
      expect(res.headers['location']).toBe('/cms/post')

      const post = await testApp.prisma.post.findFirst({ where: { title: 'CMS Post' } })
      expect(post).not.toBeNull()
    } finally {
      await altApp.prisma.$disconnect()
    }
  })
})

// ─── hiddenModels option ──────────────────────────────────────────────────────

describe('hiddenModels option', () => {
  it('hides an additional model when listed in hiddenModels', async () => {
    const altApp = await buildTestApp({ hiddenModels: ['User'] })
    try {
      const res = await request(altApp.express)
        .get('/admin')
        .set('Cookie', adminCredentials.cookie)
        .set('X-Inertia', 'true')
      const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
      expect(names).not.toContain('User')
    } finally {
      await altApp.prisma.$disconnect()
    }
  })

  it('still shows Post when only User is hidden', async () => {
    const altApp = await buildTestApp({ hiddenModels: ['User'] })
    try {
      const res = await request(altApp.express)
        .get('/admin')
        .set('Cookie', adminCredentials.cookie)
        .set('X-Inertia', 'true')
      const names = (res.body.props.models as Array<{ name: string }>).map((m) => m.name)
      expect(names).toContain('Post')
    } finally {
      await altApp.prisma.$disconnect()
    }
  })
})

// ─── AdminOptions shape ───────────────────────────────────────────────────────

describe('AdminOptions shape', () => {
  it('does not have an adminEmails field', () => {
    const opts: AdminOptions = { meta: [], auth: testApp.auth }
    expect((opts as Record<string, unknown>)['adminEmails']).toBeUndefined()
  })

  it('accepts an optional logger field', () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    const opts: AdminOptions = { meta: [], auth: testApp.auth, logger }
    expect(opts.logger).toBe(logger)
  })
})