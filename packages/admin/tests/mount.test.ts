import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mountAdmin } from '../src/mount.js'
import type { AdminOptions, PrismaClientLike } from '../src/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

const minimalDmmf = {
  datamodel: {
    models: [
      {
        name: 'Post',
        dbName: null,
        fields: [
          {
            name: 'id',
            type: 'Int',
            kind: 'scalar' as const,
            isRequired: true,
            isUnique: false,
            isId: true,
            isList: false,
            hasDefaultValue: true,
            isReadOnly: false,
            isGenerated: false,
            isUpdatedAt: false,
          },
          {
            name: 'title',
            type: 'String',
            kind: 'scalar' as const,
            isRequired: true,
            isUnique: false,
            isId: false,
            isList: false,
            hasDefaultValue: false,
            isReadOnly: false,
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
      },
    ],
    enums: [],
  },
}

function baseOptions(overrides: Partial<AdminOptions> = {}): AdminOptions {
  return {
    dmmf: minimalDmmf,
    auth: makeAuth('admin'),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mountAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mounts the admin dashboard at /admin by default', async () => {
    const app = express()
    app.use((_req, res, next) => {
      ;(res as unknown as Record<string, unknown>)['inertia'] = (
        component: string,
        props: Record<string, unknown> = {},
      ) => res.json({ component, props })
      next()
    })
    mountAdmin(app, mockPrisma, baseOptions())

    const res = await request(app).get('/admin')
    expect(res.status).toBe(200)
    expect(res.body.component).toBe('Admin/Dashboard')
  })

  it('mounts at a custom prefix when specified', async () => {
    const app = express()
    app.use((_req, res, next) => {
      ;(res as unknown as Record<string, unknown>)['inertia'] = (
        component: string,
        props: Record<string, unknown> = {},
      ) => res.json({ component, props })
      next()
    })
    mountAdmin(app, mockPrisma, baseOptions({ prefix: '/cms' }))

    const atCustom = await request(app).get('/cms')
    expect(atCustom.status).toBe(200)

    const atDefault = await request(app).get('/admin')
    expect(atDefault.status).toBe(404)
  })

  it('returns 403 when there is no active session', async () => {
    const app = express()
    mountAdmin(app, mockPrisma, baseOptions({ auth: makeAuth(null) }))

    const res = await request(app).get('/admin')
    expect(res.status).toBe(403)
  })

  it('returns 403 when the session user does not have the admin role', async () => {
    const app = express()
    mountAdmin(app, mockPrisma, baseOptions({ auth: makeAuth('user') }))

    const res = await request(app).get('/admin')
    expect(res.status).toBe(403)
  })

  it('passes showAuthModels to parseDmmf without throwing', () => {
    const dmmfWithSession = {
      datamodel: {
        ...minimalDmmf.datamodel,
        models: [
          ...minimalDmmf.datamodel.models,
          {
            name: 'Session',
            dbName: null,
            fields: [
              {
                name: 'id',
                type: 'String',
                kind: 'scalar' as const,
                isRequired: true,
                isUnique: false,
                isId: true,
                isList: false,
                hasDefaultValue: false,
                isReadOnly: false,
                isGenerated: false,
                isUpdatedAt: false,
              },
            ],
          },
        ],
      },
    }
    const app = express()
    expect(() =>
      mountAdmin(app, mockPrisma, baseOptions({ dmmf: dmmfWithSession, showAuthModels: true })),
    ).not.toThrow()
  })

  it('does not throw during mount', () => {
    const app = express()
    expect(() => mountAdmin(app, mockPrisma, baseOptions())).not.toThrow()
  })

  it('AdminOptions has no adminEmails field', () => {
    const opts: AdminOptions = baseOptions()
    expect((opts as Record<string, unknown>)['adminEmails']).toBeUndefined()
  })
})