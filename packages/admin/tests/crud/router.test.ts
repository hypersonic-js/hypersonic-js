import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAdminRouter } from '../../src/crud/router.js'
import type { AdminModelMeta, PrismaClientLike, LoggerLike } from '../../src/types.js'
import { MAX_RELATED_OPTIONS } from '../../src/constants.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const postDelegate = {
  findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Post 1' }]),
  findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Post 1' }),
  create: vi.fn().mockResolvedValue({ id: 2, title: 'New Post' }),
  update: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
  delete: vi.fn().mockResolvedValue({ id: 1 }),
  count: vi.fn().mockResolvedValue(3),
}

const userDelegate = {
  findMany: vi.fn().mockResolvedValue([]),
  findUnique: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
  count: vi.fn().mockResolvedValue(0),
}

const mockPrisma = {
  $disconnect: vi.fn(),
  post: postDelegate,
  user: userDelegate,
} as unknown as PrismaClientLike

const userModel: AdminModelMeta = {
  name: 'User',
  urlSlug: 'user',
  displayName: 'Users',
  idField: 'id',
  idType: 'string',
  displayField: 'name',
  fields: [
    { name: 'id', prismaType: 'String', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'name', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  listFields: [
    { name: 'id', prismaType: 'String', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'name', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  formFields: [
    { name: 'name', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
}

const postModel: AdminModelMeta = {
  name: 'Post',
  urlSlug: 'post',
  displayName: 'Posts',
  idField: 'id',
  idType: 'number',
  displayField: 'title',
  fields: [
    { name: 'id', prismaType: 'Int', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  listFields: [
    { name: 'id', prismaType: 'Int', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
  ],
  formFields: [
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isForeignKey: false, isList: false },
    { name: 'userId', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: true, isForeignKey: true, relatedModelName: 'User', isList: false },
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

  const router = createAdminRouter(mockPrisma, models, PREFIX, allMeta, logger)
  app.use(PREFIX, router)

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }))

  return app
}

// -- Dashboard ----------------------------------------------------------------

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

  it('returns hasMore: true when result count equals MAX_RELATED_OPTIONS', async () => {
    const hundredUsers = Array.from({ length: MAX_RELATED_OPTIONS }, (_, i) => ({ id: `u${i}`, name: `User ${i}` }))
    userDelegate.findMany.mockResolvedValueOnce(hundredUsers)
    const app = buildApp()
    const res = await request(app).get('/admin/related-options/user')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(true)
  })

  it('passes skip based on page query param', async () => {
    const app = buildApp()
    await request(app).get('/admin/related-options/user?page=3')
    expect(userDelegate.findMany).toHaveBeenCalledWith({
      take: MAX_RELATED_OPTIONS,
      skip: MAX_RELATED_OPTIONS * 2,
    })
  })

  it('defaults to page 1 when page param is absent', async () => {
    const app = buildApp()
    await request(app).get('/admin/related-options/user')
    expect(userDelegate.findMany).toHaveBeenCalledWith({
      take: MAX_RELATED_OPTIONS,
      skip: 0,
    })
  })

  it('uses allMeta so hidden models can still be queried', async () => {
    userDelegate.findMany.mockResolvedValueOnce([{ id: 'u1', name: 'Alice' }])
    const app = buildApp([postModel], [postModel, userModel])
    const res = await request(app).get('/admin/related-options/user')
    expect(res.status).toBe(200)
    expect(res.body.options).toHaveLength(1)
  })

  it('returns 404 for an unknown related model', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/related-options/nonexistent')
    expect(res.status).toBe(404)
  })

  it('returns 500 when Prisma throws', async () => {
    userDelegate.findMany.mockRejectedValueOnce(new Error('DB error'))
    const app = buildApp()
    const res = await request(app).get('/admin/related-options/user')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal Server Error')
  })
})

// -- Error logging ------------------------------------------------------------

describe('error logging', () => {
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
    const app = buildApp() // no logger
    const res = await request(app).post('/admin/post').send({ title: 'Fail' })
    expect(res.status).toBe(500)
  })
})