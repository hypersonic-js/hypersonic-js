import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mountAdmin } from '../src/mount.js'
import type { AdminOptions, AdminModelMeta, PrismaClientLike } from '../src/types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  }
}

const mockPrisma = {
  $disconnect: vi.fn(),
  post: makeDelegate(),
} as unknown as PrismaClientLike

function makeAuth(role: string | null) {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(
        role !== null ? { user: { role } } : null,
      ),
    },
  }
}

function makeField(name: string, overrides: Partial<AdminModelMeta['fields'][number]> = {}): AdminModelMeta['fields'][number] {
  return {
    name,
    prismaType: 'String',
    kind: 'scalar',
    isRequired: true,
    isId: false,
    isUnique: false,
    hasDefault: false,
    isReadOnly: false,
    isList: false,
    ...overrides,
  }
}

const minimalMeta: AdminModelMeta[] = [
  {
    name: 'Post',
    urlSlug: 'post',
    displayName: 'Posts',
    idField: 'id',
    idType: 'number',
    displayField: 'title',
    fields: [
      makeField('id', { prismaType: 'Int', isId: true, hasDefault: true }),
      makeField('title'),
    ],
    listFields: [
      makeField('id', { prismaType: 'Int', isId: true, hasDefault: true }),
      makeField('title'),
    ],
    formFields: [makeField('title')],
  },
]

const sessionMeta: AdminModelMeta = {
  name: 'Session',
  urlSlug: 'session',
  displayName: 'Sessions',
  idField: 'id',
  idType: 'string',
  displayField: 'id',
  fields: [makeField('id', { isId: true })],
  listFields: [makeField('id', { isId: true })],
  formFields: [],
}

function baseOptions(overrides: Partial<AdminOptions> = {}): AdminOptions {
  return {
    meta: minimalMeta,
    auth: makeAuth('admin'),
    ...overrides,
  }
}

function inertiaApp() {
  const app = express()
  app.use((_req, res, next) => {
    ;(res as unknown as Record<string, unknown>)['inertia'] = (
      component: string,
      props: Record<string, unknown> = {},
    ) => res.json({ component, props })
    next()
  })
  return app
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mountAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mounts the admin dashboard at /admin by default', async () => {
    const app = inertiaApp()
    mountAdmin(app, mockPrisma, baseOptions())
    const res = await request(app).get('/admin')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/Dashboard')
  })

  it('mounts at a custom prefix when specified', async () => {
    const app = inertiaApp()
    mountAdmin(app, mockPrisma, baseOptions({ prefix: '/cms' }))
    expect((await request(app).get('/cms')).status).toBe(200)
    expect((await request(app).get('/admin')).status).toBe(404)
  })

  it('returns 403 when there is no active session', async () => {
    const app = express()
    mountAdmin(app, mockPrisma, baseOptions({ auth: makeAuth(null) }))
    expect((await request(app).get('/admin')).status).toBe(403)
  })

  it('returns 403 when the session user does not have the admin role', async () => {
    const app = express()
    mountAdmin(app, mockPrisma, baseOptions({ auth: makeAuth('user') }))
    expect((await request(app).get('/admin')).status).toBe(403)
  })

  it('filters DEFAULT_HIDDEN_MODELS from meta by default', async () => {
    const app = inertiaApp()
    mountAdmin(app, mockPrisma, baseOptions({ meta: [...minimalMeta, sessionMeta] }))
    // Session is in DEFAULT_HIDDEN_MODELS — its route should not exist
    expect((await request(app).get('/admin/session')).status).toBe(404)
  })

  it('includes auth models when showAuthModels is true', async () => {
    const app = inertiaApp()
    mountAdmin(app, mockPrisma, baseOptions({ meta: [...minimalMeta, sessionMeta], showAuthModels: true }))
    expect((await request(app).get('/admin/session')).status).toBe(200)
  })

  it('excludes models listed in hiddenModels', async () => {
    const app = inertiaApp()
    mountAdmin(app, mockPrisma, baseOptions({ hiddenModels: ['Post'] }))
    expect((await request(app).get('/admin/post')).status).toBe(404)
  })

  it('does not throw during mount', () => {
    const app = express()
    expect(() => mountAdmin(app, mockPrisma, baseOptions())).not.toThrow()
  })

  it('AdminOptions has meta instead of dmmf', () => {
    const opts: AdminOptions = baseOptions()
    expect((opts as Record<string, unknown>)['dmmf']).toBeUndefined()
    expect(Array.isArray(opts.meta)).toBe(true)
  })

  it('AdminOptions has no adminEmails field', () => {
    const opts: AdminOptions = baseOptions()
    expect((opts as Record<string, unknown>)['adminEmails']).toBeUndefined()
  })
})