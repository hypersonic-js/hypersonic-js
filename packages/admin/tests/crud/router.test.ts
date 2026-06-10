import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createAdminRouter } from '../../src/crud/router.js'
import type { AdminModelMeta, PrismaClientLike } from '../../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Post 1' }]),
    findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Post 1' }),
    create: vi.fn().mockResolvedValue({ id: 2, title: 'New' }),
    update: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
    delete: vi.fn().mockResolvedValue({ id: 1 }),
    count: vi.fn().mockResolvedValue(3),
  }
}

const postDelegate = makeDelegate()
const userDelegate = makeDelegate()

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
  fields: [],
  listFields: [
    { name: 'id', prismaType: 'String', kind: 'scalar', isRequired: true, isId: true, isUnique: false, hasDefault: true, isReadOnly: false, isForeignKey: false, isList: false },
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

const PREFIX = '/admin'

function buildApp(
  models: AdminModelMeta[] = [postModel],
  allMeta: AdminModelMeta[] = [postModel, userModel],
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

  const router = createAdminRouter(mockPrisma, models, PREFIX, allMeta)
  app.use(PREFIX, router)

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }))

  return app
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

describe('GET /admin — Dashboard', () => {
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

// ── ModelIndex ────────────────────────────────────────────────────────────────

describe('GET /admin/:model — ModelIndex', () => {
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

// ── Create form ───────────────────────────────────────────────────────────────

describe('GET /admin/:model/new — Create form', () => {
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
    const userOptions = res.body.props.relatedOptions['userId']
    expect(userOptions).toHaveLength(2)
    expect(userOptions[0]).toEqual({ id: 'u1', label: 'Alice' })
    expect(userOptions[1]).toEqual({ id: 'u2', label: 'Bob' })
  })

  it('returns empty options when the related model is not in allMeta', async () => {
    const app = buildApp([postModel], [postModel]) // allMeta without userModel
    const res = await request(app).get('/admin/post/new')
    expect(res.body.props.relatedOptions['userId']).toEqual([])
  })

  it('returns empty relatedOptions for a model with no FK fields', async () => {
    const plainModel: AdminModelMeta = {
      ...postModel,
      formFields: [postModel.formFields[0]!], // only title, no userId
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

// ── Edit form ─────────────────────────────────────────────────────────────────

describe('GET /admin/:model/:id — Edit form', () => {
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
    expect(res.body.props.relatedOptions['userId']).toHaveLength(1)
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

// ── POST create ───────────────────────────────────────────────────────────────

describe('POST /admin/:model — Create', () => {
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

// ── PATCH update ──────────────────────────────────────────────────────────────

describe('PATCH /admin/:model/:id — Update', () => {
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

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /admin/:model/:id — Delete', () => {
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