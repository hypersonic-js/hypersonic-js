import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

import { createAdminRouter } from '../../src/crud/router.js'
import type { AdminModelMeta, PrismaClientLike, LoggerLike, AdminAuthLike } from '../../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Post 1' }]),
    findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Post 1' }),
    create: vi.fn().mockResolvedValue({ id: 2, title: 'Created' }),
    update: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
    delete: vi.fn().mockResolvedValue({ id: 1 }),
    count: vi.fn().mockResolvedValue(3),
  }
}

const postDelegate = makeDelegate()
const userDelegate = makeDelegate()

const mockPrisma = {
  $disconnect: vi.fn(),
  get post() { return postDelegate },
  get user() { return userDelegate },
} as unknown as PrismaClientLike

const postModel: AdminModelMeta = {
  name: 'Post',
  urlSlug: 'post',
  displayName: 'Posts',
  idField: 'id',
  idType: 'number',
  displayField: 'title',
  fields: [],
  listFields: [
    { name: 'id', prismaType: 'Int', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  formFields: [
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'userId', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: true, isForeignKey: true, relatedModelName: 'User', isList: false },
  ],
}

// Minimal user model used as FK option source in generic CRUD tests
const userModel: AdminModelMeta = {
  name: 'User',
  urlSlug: 'user',
  displayName: 'Users',
  idField: 'id',
  idType: 'string',
  displayField: 'name',
  fields: [],
  listFields: [
    { name: 'id', prismaType: 'String', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  formFields: [],
}

// Full user model with role enum — used in Better Auth tests
const betterAuthUserModel: AdminModelMeta = {
  name: 'User',
  urlSlug: 'user',
  displayName: 'Users',
  idField: 'id',
  idType: 'string',
  displayField: 'name',
  fields: [],
  listFields: [],
  formFields: [
    { name: 'name', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'email', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: true, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'role', prismaType: 'Role', kind: 'enum', isRequired: true, isId: false, isUnique: false, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false, enumValues: ['user', 'admin'] },
  ],
}

const PREFIX = '/admin'

function buildApp(
  models: AdminModelMeta[] = [postModel],
  allMeta: AdminModelMeta[] = [postModel, userModel],
  logger?: LoggerLike,
) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  app.use((_req, res, next) => {
    ;(res as unknown as Record<string, unknown>)['inertia'] = (
      component: string,
      props: Record<string, unknown> = {},
    ) => {
      res.status(200).json({ __inertia: true, component, props })
    }
    next()
  })

  const router = createAdminRouter(mockPrisma, models, PREFIX, { allMeta, logger })
  app.use(PREFIX, router)

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }))

  return app
}

// Builds an app with Better Auth admin methods available for the User model
function buildAuthApp(auth: AdminAuthLike, models = [betterAuthUserModel]) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  app.use((_req, res, next) => {
    ;(res as unknown as Record<string, unknown>)['inertia'] = (
      component: string,
      props: Record<string, unknown> = {},
    ) => {
      res.status(200).json({ __inertia: true, component, props })
    }
    next()
  })

  const router = createAdminRouter(mockPrisma, models, PREFIX, { allMeta: models, auth })
  app.use(PREFIX, router)

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }))

  return app
}

// ── Dashboard ----------------------------------------------------------------

describe('GET /admin -- Dashboard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Admin/Dashboard with model counts', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/Dashboard')
    expect(res.body.props.models).toHaveLength(1)
    expect(res.body.props.models[0].name).toBe('Post')
    expect(res.body.props.models[0].recordCount).toBe(3)
    expect(res.body.props.prefix).toBe(PREFIX)
  })

  it('renders with empty models array when no models are registered', async () => {
    const app = buildApp([])
    const res = await request(app).get('/admin')
    expect(res.status).toBe(200)
    expect(res.body.props.models).toHaveLength(0)
  })
})

// -- ModelIndex ---------------------------------------------------------------

describe('GET /admin/:model -- ModelIndex', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Admin/ModelIndex with records and pagination', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/post')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelIndex')
    expect(res.body.props.model.name).toBe('Post')
    expect(res.body.props.records).toHaveLength(1)
    expect(res.body.props.pagination.total).toBe(3)
    expect(res.body.props.prefix).toBe(PREFIX)
  })

  it('passes pagination params to the query', async () => {
    const app = buildApp()
    await request(app).get('/admin/post?page=2&perPage=5')
    expect(postDelegate.findMany).toHaveBeenCalledWith({ skip: 5, take: 5 })
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/nonexistent')
    expect(res.status).toBe(404)
  })
})

// -- Create form --------------------------------------------------------------

describe('GET /admin/:model/new -- Create form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Admin/ModelForm with null record', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/post/new')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelForm')
    expect(res.body.props.record).toBeNull()
    expect(res.body.props.model.name).toBe('Post')
    expect(res.body.props.errors).toEqual({})
  })

  it('includes relatedOptions in props', async () => {
    userDelegate.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }])
    const app = buildApp()
    const res = await request(app).get('/admin/post/new')
    expect(res.body.props.relatedOptions).toBeDefined()
    expect(res.body.props.relatedOptions['userId']).toBeDefined()
  })

  it('fetches options from the related model for each FK field', async () => {
    userDelegate.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }])
    const app = buildApp()
    const res = await request(app).get('/admin/post/new')
    const { options: userOptions, hasMore } = res.body.props.relatedOptions['userId']
    expect(userOptions).toHaveLength(2)
    expect(userOptions[0]).toEqual({ id: 'u1', label: 'Alice' })
    expect(userOptions[1]).toEqual({ id: 'u2', label: 'Bob' })
    expect(hasMore).toBe(false)
  })

  it('returns empty options when the related model is not in allMeta', async () => {
    const app = buildApp([postModel], [postModel])
    const res = await request(app).get('/admin/post/new')
    expect(res.body.props.relatedOptions['userId']).toEqual({ options: [], hasMore: false })
  })

  it('returns empty relatedOptions for a model with no FK fields', async () => {
    const plainModel: AdminModelMeta = {
      ...postModel,
      formFields: [postModel.formFields[0]!],
    }
    const app = buildApp([plainModel], [plainModel])
    const res = await request(app).get('/admin/post/new')
    expect(res.body.props.relatedOptions).toEqual({})
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/nonexistent/new')
    expect(res.status).toBe(404)
  })
})

// -- Edit form ----------------------------------------------------------------

describe('GET /admin/:model/:id -- Edit form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Admin/ModelForm with the record', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/post/1')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelForm')
    expect(res.body.props.record).toEqual({ id: 1, title: 'Post 1' })
  })

  it('includes relatedOptions for edit form', async () => {
    userDelegate.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }])
    const app = buildApp()
    const res = await request(app).get('/admin/post/1')
    expect(res.body.props.relatedOptions).toBeDefined()
    expect(res.body.props.relatedOptions['userId'].options).toHaveLength(1)
  })

  it('queries with numeric id for number idType', async () => {
    const app = buildApp()
    await request(app).get('/admin/post/42')
    expect(postDelegate.findUnique).toHaveBeenCalledWith({ where: { id: 42 } })
  })

  it('returns 404 when record is not found', async () => {
    postDelegate.findUnique.mockResolvedValueOnce(null)
    const app = buildApp()
    const res = await request(app).get('/admin/post/999')
    expect(res.status).toBe(404)
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/nonexistent/1')
    expect(res.status).toBe(404)
  })
})

// -- POST create --------------------------------------------------------------

describe('POST /admin/:model -- Create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a record and redirects to the list', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/admin/post')
      .send({ title: 'Brand New Post', userId: 'u1' })
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')
    expect(postDelegate.create).toHaveBeenCalledOnce()
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).post('/admin/nonexistent').send({})
    expect(res.status).toBe(404)
  })
})

// -- PATCH update -------------------------------------------------------------

describe('PATCH /admin/:model/:id -- Update', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates a record and redirects to the list', async () => {
    const app = buildApp()
    const res = await request(app)
      .patch('/admin/post/1')
      .send({ title: 'Updated Title' })
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')
    expect(postDelegate.update).toHaveBeenCalledOnce()
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).patch('/admin/nonexistent/1').send({})
    expect(res.status).toBe(404)
  })
})

// -- DELETE -------------------------------------------------------------------

describe('DELETE /admin/:model/:id -- Delete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a record and redirects to the list', async () => {
    const app = buildApp()
    const res = await request(app).delete('/admin/post/1')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post')
    expect(postDelegate.delete).toHaveBeenCalledOnce()
  })

  it('returns 404 for an unknown model', async () => {
    const app = buildApp()
    const res = await request(app).delete('/admin/nonexistent/1')
    expect(res.status).toBe(404)
  })
})

// -- Error handling -- Prisma throws ------------------------------------------

describe('error handling -- Prisma throws', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET / returns 500 when countRecords throws', async () => {
    postDelegate.count.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).get('/admin')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('GET /:model/new returns 500 when buildRelatedOptions throws', async () => {
    userDelegate.findMany.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).get('/admin/post/new')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('GET /:model/:id returns 500 when findUnique throws', async () => {
    postDelegate.findUnique.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).get('/admin/post/1')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('GET /:model returns 500 when findMany throws', async () => {
    postDelegate.findMany.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).get('/admin/post')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('POST /:model returns 500 when createRecord throws', async () => {
    postDelegate.create.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).post('/admin/post').send({ title: 'Fail' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('PATCH /:model/:id returns 500 when updateRecord throws', async () => {
    postDelegate.update.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).patch('/admin/post/1').send({ title: 'Fail' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('DELETE /:model/:id returns 500 when deleteRecord throws', async () => {
    postDelegate.delete.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).delete('/admin/post/1')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })

  it('POST /:model redirects back to Referer for an Inertia request when createRecord throws', async () => {
    postDelegate.create.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app)
      .post('/admin/post')
      .send({ title: 'Fail' })
      .set('X-Inertia', 'true')
      .set('Referer', '/admin/post/new')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post/new')
  })

  it('POST /:model redirects to admin root when no Referer on an Inertia request', async () => {
    postDelegate.create.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app)
      .post('/admin/post')
      .send({ title: 'Fail' })
      .set('X-Inertia', 'true')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/')
  })

  it('PATCH /:model/:id redirects back to Referer for an Inertia request when updateRecord throws', async () => {
    postDelegate.update.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app)
      .patch('/admin/post/1')
      .send({ title: 'Fail' })
      .set('X-Inertia', 'true')
      .set('Referer', '/admin/post/1')
    expect(res.status).toBe(303)
    expect(res.headers['location']).toBe('/admin/post/1')
  })
})

// -- Related options endpoint -------------------------------------------------

describe('GET /admin/related-options/:relatedModel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns options and hasMore: false when result is under the limit', async () => {
    userDelegate.findMany.mockResolvedValueOnce([{ id: 'u1', name: 'Alice' }])
    const app = buildApp()
    const res = await request(app).get('/admin/related-options/user')
    expect(res.status).toBe(200)
    expect(res.body.options).toEqual([{ id: 'u1', label: 'Alice' }])
    expect(res.body.hasMore).toBe(false)
  })

  it('returns 404 for an unknown related model', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/related-options/nonexistent')
    expect(res.status).toBe(404)
  })
})

// -- Logger -------------------------------------------------------------------

describe('logger integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls logger.error when createRecord throws', async () => {
    const logger: LoggerLike = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    postDelegate.create.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp([postModel], [postModel, userModel], logger)
    await request(app).post('/admin/post').send({ title: 'Fail' })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('calls logger.error when updateRecord throws', async () => {
    const logger: LoggerLike = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    postDelegate.update.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp([postModel], [postModel, userModel], logger)
    await request(app).patch('/admin/post/1').send({ title: 'Fail' })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('calls logger.error when deleteRecord throws', async () => {
    const logger: LoggerLike = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    postDelegate.delete.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp([postModel], [postModel, userModel], logger)
    await request(app).delete('/admin/post/1')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('calls logger.error when a GET handler throws', async () => {
    const logger: LoggerLike = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    postDelegate.findMany.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp([postModel], [postModel, userModel], logger)
    await request(app).get('/admin/post')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('passes the error object to logger.error', async () => {
    const logger: LoggerLike = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    const dbError = new Error('Constraint violation')
    postDelegate.create.mockRejectedValueOnce(dbError)
    const app = buildApp([postModel], [postModel, userModel], logger)
    await request(app).post('/admin/post').send({ title: 'Fail' })
    const callArg = vi.mocked(logger.error).mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArg['err']).toBe(dbError)
  })

  it('does not throw when no logger is provided and an error occurs', async () => {
    postDelegate.create.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).post('/admin/post').send({ title: 'Fail' })
    expect(res.status).toBe(500)
  })
})

// ── Better Auth user management ───────────────────────────────────────────────

describe('Better Auth user management', () => {
  let mockCreateUser: ReturnType<typeof vi.fn>
  let mockAdminUpdateUser: ReturnType<typeof vi.fn>
  let mockRemoveUser: ReturnType<typeof vi.fn>
  let mockAuth: AdminAuthLike

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateUser = vi.fn().mockResolvedValue({ user: { id: 'new-id', name: 'Alice' } })
    mockAdminUpdateUser = vi.fn().mockResolvedValue({ user: { id: 'user-1', name: 'Updated' } })
    mockRemoveUser = vi.fn().mockResolvedValue({ success: true })
    mockAuth = {
      api: {
        getSession: vi.fn(),
        createUser: mockCreateUser,
        adminUpdateUser: mockAdminUpdateUser,
        removeUser: mockRemoveUser,
      },
    }
  })

  // GET /user/new ─────────────────────────────────────────────────────────────

  describe('GET /admin/user/new -- bespoke user create form', () => {
    it('renders Admin/UserCreate instead of Admin/ModelForm', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/UserCreate')
    })

    it('passes roles extracted from the role field enumValues', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.body.props.roles).toEqual(['user', 'admin'])
    })

    it('passes an empty roles array when the user model has no role enum field', async () => {
      const noRoleModel: AdminModelMeta = {
        ...betterAuthUserModel,
        formFields: betterAuthUserModel.formFields.filter((f) => f.name !== 'role'),
      }
      const app = buildAuthApp(mockAuth, [noRoleModel])
      const res = await request(app).get('/admin/user/new')
      expect(res.body.props.roles).toEqual([])
    })

    it('passes prefix and model to the Inertia page', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.body.props.prefix).toBe(PREFIX)
      expect(res.body.props.model.name).toBe('User')
    })

    it('passes empty errors object', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.body.props.errors).toEqual({})
    })
  })

  // POST /user ────────────────────────────────────────────────────────────────

  describe('POST /admin/user -- create user via Better Auth', () => {
    it('calls auth.api.createUser with name, email, password, and role', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'admin' })
      expect(res.status).toBe(303)
      expect(mockCreateUser).toHaveBeenCalledWith({
        body: { name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'admin' },
      })
    })

    it('redirects to the user index on success', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'user' })
      expect(res.headers['location']).toBe('/admin/user')
    })

    it('passes role as undefined when role field is empty', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', role: '' })
      expect(mockCreateUser).toHaveBeenCalledWith({
        body: { name: 'Alice', email: 'alice@example.com', password: 'secret123', role: undefined },
      })
    })

    it('does NOT call prisma.user.create', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'user' })
      expect(userDelegate.create).not.toHaveBeenCalled()
    })

    it('redirects for Inertia when createUser throws', async () => {
      mockCreateUser.mockRejectedValueOnce(new Error('auth error'))
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'user' })
        .set('X-Inertia', 'true')
        .set('Referer', '/admin/user/new')
      expect(res.status).toBe(303)
      expect(res.headers['location']).toBe('/admin/user/new')
    })
  })

  // PATCH /user/:id ───────────────────────────────────────────────────────────

  describe('PATCH /admin/user/:id -- update user via Better Auth', () => {
    it('calls auth.api.adminUpdateUser with userId and coerced data', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'admin' })
      expect(res.status).toBe(303)
      expect(mockAdminUpdateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ userId: 'user-123' }),
        }),
      )
    })

    it('forwards request headers to adminUpdateUser for session validation', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'user' })
        .set('Cookie', 'better-auth.session_token=abc')
      const callArg = mockAdminUpdateUser.mock.calls[0]?.[0] as { headers: Record<string, unknown> }
      expect(callArg.headers).toBeDefined()
    })

    it('redirects to the user index on success', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'user' })
      expect(res.headers['location']).toBe('/admin/user')
    })

    it('does NOT call prisma.user.update', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'user' })
      expect(userDelegate.update).not.toHaveBeenCalled()
    })

    it('returns 500 when adminUpdateUser throws', async () => {
      mockAdminUpdateUser.mockRejectedValueOnce(new Error('auth error'))
      const app = buildAuthApp(mockAuth)
      const res = await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'user' })
      expect(res.status).toBe(500)
    })
  })

  // DELETE /user/:id ──────────────────────────────────────────────────────────

  describe('DELETE /admin/user/:id -- delete user via Better Auth', () => {
    it('calls auth.api.removeUser with the userId', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).delete('/admin/user/user-123')
      expect(res.status).toBe(303)
      expect(mockRemoveUser).toHaveBeenCalledWith(
        expect.objectContaining({ body: { userId: 'user-123' } }),
      )
    })

    it('forwards request headers to removeUser for session validation', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app)
        .delete('/admin/user/user-123')
        .set('Cookie', 'better-auth.session_token=abc')
      const callArg = mockRemoveUser.mock.calls[0]?.[0] as { headers: Record<string, unknown> }
      expect(callArg.headers).toBeDefined()
    })

    it('redirects to the user index on success', async () => {
      const app = buildAuthApp(mockAuth)
      const res = await request(app).delete('/admin/user/user-123')
      expect(res.headers['location']).toBe('/admin/user')
    })

    it('does NOT call prisma.user.delete', async () => {
      const app = buildAuthApp(mockAuth)
      await request(app).delete('/admin/user/user-123')
      expect(userDelegate.delete).not.toHaveBeenCalled()
    })

    it('returns 500 when removeUser throws', async () => {
      mockRemoveUser.mockRejectedValueOnce(new Error('auth error'))
      const app = buildAuthApp(mockAuth)
      const res = await request(app).delete('/admin/user/user-123')
      expect(res.status).toBe(500)
    })
  })

  // Fallback behaviour ────────────────────────────────────────────────────────

  describe('fallback to generic Prisma routes when Better Auth is not configured', () => {
    it('GET /user/new renders Admin/ModelForm when auth has no createUser', async () => {
      const authWithoutAdmin: AdminAuthLike = { api: { getSession: vi.fn() } }
      const simpleUserModel: AdminModelMeta = {
        ...betterAuthUserModel,
        formFields: [
          { name: 'name', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
        ],
      }
      const app = buildAuthApp(authWithoutAdmin, [simpleUserModel])
      const res = await request(app).get('/admin/user/new')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/ModelForm')
    })

    it('POST /user calls prisma.user.create when auth has no createUser', async () => {
      userDelegate.create.mockResolvedValueOnce({ id: 'new-id', name: 'Alice' })
      const authWithoutAdmin: AdminAuthLike = { api: { getSession: vi.fn() } }
      const app = buildAuthApp(authWithoutAdmin, [betterAuthUserModel])
      await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com' })
      expect(userDelegate.create).toHaveBeenCalledOnce()
      expect(mockCreateUser).not.toHaveBeenCalled()
    })

    it('customises the user model name via betterAuthUserModel option', async () => {
      const customModel: AdminModelMeta = {
        ...betterAuthUserModel,
        name: 'Member',
        urlSlug: 'member',
      }
      const app = express()
      app.use(express.json())
      app.use((_req, res, next) => {
        ;(res as unknown as Record<string, unknown>)['inertia'] = (
          component: string,
          props: Record<string, unknown> = {},
        ) => res.status(200).json({ __inertia: true, component, props })
        next()
      })
      const router = createAdminRouter(mockPrisma, [customModel], PREFIX, {
        allMeta: [customModel],
        auth: mockAuth,
        betterAuthUserModel: 'Member',
      })
      app.use(PREFIX, router)

      const res = await request(app).get('/admin/member/new')
      expect(res.body.component).toBe('Admin/UserCreate')
    })
  })

  // Partial Better Auth configuration ────────────────────────────────────────
  // Covers the case where the auth object has only a subset of the three admin
  // methods. Each verb must be independently gated so missing methods fall
  // through to the generic Prisma routes rather than crashing with a TypeError.

  describe('partial Better Auth configuration', () => {
    // ── createUser present, adminUpdateUser absent ──────────────────────────

    it('PATCH /user/:id falls through to prisma.update when only createUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), createUser: mockCreateUser },
      }
      userDelegate.findUnique.mockResolvedValueOnce({ id: 'user-123', name: 'Bob' })
      userDelegate.update.mockResolvedValueOnce({ id: 'user-123', name: 'Updated' })
      const app = buildAuthApp(partialAuth)
      const res = await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Updated' })
      expect(res.status).toBe(303)
      expect(userDelegate.update).toHaveBeenCalledOnce()
      expect(mockAdminUpdateUser).not.toHaveBeenCalled()
    })

    // ── createUser present, removeUser absent ───────────────────────────────

    it('DELETE /user/:id falls through to prisma.delete when only createUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), createUser: mockCreateUser },
      }
      userDelegate.delete.mockResolvedValueOnce({ id: 'user-123' })
      const app = buildAuthApp(partialAuth)
      const res = await request(app).delete('/admin/user/user-123')
      expect(res.status).toBe(303)
      expect(userDelegate.delete).toHaveBeenCalledOnce()
      expect(mockRemoveUser).not.toHaveBeenCalled()
    })

    // ── adminUpdateUser present, createUser absent ──────────────────────────

    it('PATCH /user/:id calls adminUpdateUser when only adminUpdateUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), adminUpdateUser: mockAdminUpdateUser },
      }
      const app = buildAuthApp(partialAuth)
      const res = await request(app)
        .patch('/admin/user/user-123')
        .send({ name: 'Bob', email: 'bob@example.com', role: 'user' })
      expect(res.status).toBe(303)
      expect(mockAdminUpdateUser).toHaveBeenCalledOnce()
      expect(userDelegate.update).not.toHaveBeenCalled()
    })

    it('GET /user/new renders Admin/ModelForm when only adminUpdateUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), adminUpdateUser: mockAdminUpdateUser },
      }
      const app = buildAuthApp(partialAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/ModelForm')
    })

    // ── removeUser present, createUser absent ───────────────────────────────

    it('DELETE /user/:id calls removeUser when only removeUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), removeUser: mockRemoveUser },
      }
      const app = buildAuthApp(partialAuth)
      const res = await request(app).delete('/admin/user/user-123')
      expect(res.status).toBe(303)
      expect(mockRemoveUser).toHaveBeenCalledOnce()
      expect(userDelegate.delete).not.toHaveBeenCalled()
    })

    it('GET /user/new renders Admin/ModelForm when only removeUser is present', async () => {
      const partialAuth: AdminAuthLike = {
        api: { getSession: vi.fn(), removeUser: mockRemoveUser },
      }
      const app = buildAuthApp(partialAuth)
      const res = await request(app).get('/admin/user/new')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/ModelForm')
    })

    // ── no admin methods present ────────────────────────────────────────────

    it('POST /user falls through to prisma.create when no admin methods are present', async () => {
      const noAdminAuth: AdminAuthLike = { api: { getSession: vi.fn() } }
      userDelegate.create.mockResolvedValueOnce({ id: 'new-id', name: 'Alice' })
      const app = buildAuthApp(noAdminAuth)
      await request(app)
        .post('/admin/user')
        .send({ name: 'Alice', email: 'alice@example.com' })
      expect(userDelegate.create).toHaveBeenCalledOnce()
      expect(mockCreateUser).not.toHaveBeenCalled()
    })
  })
})
