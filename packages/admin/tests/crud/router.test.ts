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

const postModel: AdminModelMeta = {
  name: 'Post',
  urlSlug: 'post',
  displayName: 'Posts',
  idField: 'id',
  idType: 'number',
  displayField: 'title',
  fields: [],
  listFields: [
    { name: 'id', prismaType: 'Int', kind: 'scalar', isRequired: true, isId: true, isUnique: true, hasDefault: true, isReadOnly: false, isList: false },
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
  ],
  formFields: [
    { name: 'title', prismaType: 'String', kind: 'scalar', isRequired: true, isId: false, isUnique: false, hasDefault: false, isReadOnly: false, isList: false },
  ],
}

const PREFIX = '/admin'

function buildApp(models: AdminModelMeta[] = [postModel]) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  // Mock res.inertia so route handlers can call it
  app.use((_req, res, next) => {
    ;(res as unknown as Record<string, unknown>)['inertia'] = (
      component: string,
      props: Record<string, unknown> = {},
    ) => {
      res.status(200).json({ __inertia: true, component, props })
    }
    next()
  })

  const router = createAdminRouter(mockPrisma, models, PREFIX)
  app.use(PREFIX, router)

  // 404 fallback
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
  it('renders Admin/ModelForm with null record', async () => {
    const app = buildApp()
    const res = await request(app).get('/admin/post/new')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/ModelForm')
    expect(res.body.props.record).toBeNull()
    expect(res.body.props.model.name).toBe('Post')
    expect(res.body.props.errors).toEqual({})
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
      .send({ title: 'Brand New Post' })
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
