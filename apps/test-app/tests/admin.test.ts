import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

import { mountAdmin } from '@hypersonic-js/admin'
import type { DmmfDocument, AdminOptions, PrismaClientLike } from '@hypersonic-js/admin'

// ─── Test-app DMMF ────────────────────────────────────────────────────────────
//
// Mirrors the test-app's Prisma schema exactly, including the Better Auth admin
// plugin fields (role, banned, banReason, banExpires) added by the migration.

const testAppDmmf: DmmfDocument = {
  datamodel: {
    models: [
      {
        name: 'User',
        dbName: null,
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'name', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'email', type: 'String', kind: 'scalar', isRequired: true, isUnique: true, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'emailVerified', type: 'Boolean', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'image', type: 'String', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'role', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'banned', type: 'Boolean', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'banReason', type: 'String', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'banExpires', type: 'DateTime', kind: 'scalar', isRequired: false, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'createdAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'updatedAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: true },
        ],
      },
      {
        name: 'Session',
        dbName: null,
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'token', type: 'String', kind: 'scalar', isRequired: true, isUnique: true, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
        ],
      },
      {
        name: 'Account',
        dbName: null,
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
        ],
      },
      {
        name: 'Verification',
        dbName: null,
        fields: [
          { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
        ],
      },
      {
        name: 'Post',
        dbName: null,
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isUnique: false, isId: true, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'body', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'userId', type: 'String', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: true, isGenerated: false, isUpdatedAt: false },
          { name: 'user', type: 'User', kind: 'object', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: false, relationName: 'PostToUser' },
          { name: 'createdAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: true, isReadOnly: false, isGenerated: false, isUpdatedAt: false },
          { name: 'updatedAt', type: 'DateTime', kind: 'scalar', isRequired: true, isUnique: false, isId: false, isList: false, hasDefaultValue: false, isReadOnly: false, isGenerated: false, isUpdatedAt: true },
        ],
      },
    ],
    enums: [],
  },
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAuth(role: string | null) {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(
        role !== null ? { user: { role } } : null,
      ),
    },
  }
}

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
  user: makeDelegate(),
  session: makeDelegate(),
  account: makeDelegate(),
  verification: makeDelegate(),
} as unknown as PrismaClientLike

function baseOptions(overrides: Partial<AdminOptions> = {}): AdminOptions {
  return {
    dmmf: testAppDmmf,
    auth: makeAuth('admin'),
    ...overrides,
  }
}

/**
 * Builds a test Express app with an inertia stub so routes return assertable
 * JSON, then mounts the admin dashboard.
 */
function buildAdminApp(options: AdminOptions) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use((_req: Request, res: Response, next: NextFunction) => {
    ;(res as unknown as Record<string, unknown>)['inertia'] = (
      component: string,
      props: Record<string, unknown> = {},
    ) => res.json({ component, props })
    next()
  })

  mountAdmin(app, mockPrisma, options)
  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mountAdmin with test-app schema', () => {
  describe('does not throw during mount', () => {
    it('mounts without error using the full test-app DMMF', () => {
      const app = express()
      expect(() => mountAdmin(app, mockPrisma, baseOptions())).not.toThrow()
    })

    it('mounts without error at a custom prefix', () => {
      const app = express()
      expect(() =>
        mountAdmin(app, mockPrisma, baseOptions({ prefix: '/cms' })),
      ).not.toThrow()
    })
  })

  describe('authentication enforcement — role-based', () => {
    it('returns 403 when there is no active session', async () => {
      const app = buildAdminApp(baseOptions({ auth: makeAuth(null) }))
      const res = await request(app).get('/admin')
      expect(res.status).toBe(403)
    })

    it('returns 403 when the session user has role "user"', async () => {
      const app = buildAdminApp(baseOptions({ auth: makeAuth('user') }))
      const res = await request(app).get('/admin')
      expect(res.status).toBe(403)
    })

    it('returns 403 for any non-admin role', async () => {
      const app = buildAdminApp(baseOptions({ auth: makeAuth('moderator') }))
      const res = await request(app).get('/admin')
      expect(res.status).toBe(403)
    })

    it('allows access when the session user has role "admin"', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /admin — dashboard', () => {
    it('renders the Admin/Dashboard component', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/Dashboard')
    })

    it('includes models in the dashboard props', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      expect(res.body.props.models).toBeDefined()
      expect(Array.isArray(res.body.props.models)).toBe(true)
    })

    it('exposes the Post model (not hidden by default)', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Post')).toBe(true)
    })

    it('exposes the User model (not in DEFAULT_HIDDEN_MODELS)', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'User')).toBe(true)
    })

    it('hides Session by default (Better Auth internal table)', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Session')).toBe(false)
    })

    it('hides Account by default (Better Auth internal table)', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Account')).toBe(false)
    })

    it('hides Verification by default (Better Auth internal table)', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Verification')).toBe(false)
    })

    it('shows Session when showAuthModels is true', async () => {
      const app = buildAdminApp(baseOptions({ showAuthModels: true }))
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Session')).toBe(true)
    })
  })

  describe('GET /admin/post — Post model index', () => {
    it('renders the Admin/ModelIndex component', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin/post')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/ModelIndex')
    })

    it('returns 403 for unauthenticated access', async () => {
      const app = buildAdminApp(baseOptions({ auth: makeAuth(null) }))
      const res = await request(app).get('/admin/post')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /admin/user — User model index', () => {
    it('renders the Admin/ModelIndex component', async () => {
      const app = buildAdminApp(baseOptions())
      const res = await request(app).get('/admin/user')
      expect(res.status).toBe(200)
      expect(res.body.component).toBe('Admin/ModelIndex')
    })
  })

  describe('custom prefix', () => {
    it('mounts at /cms instead of /admin', async () => {
      const app = buildAdminApp(baseOptions({ prefix: '/cms' }))
      const adminRes = await request(app).get('/admin')
      const cmsRes = await request(app).get('/cms')
      expect(adminRes.status).toBe(404)
      expect(cmsRes.status).toBe(200)
    })

    it('dashboard at custom prefix renders Admin/Dashboard', async () => {
      const app = buildAdminApp(baseOptions({ prefix: '/cms' }))
      const res = await request(app).get('/cms')
      expect(res.body.component).toBe('Admin/Dashboard')
    })
  })

  describe('hiddenModels option', () => {
    it('hides an additional model when listed in hiddenModels', async () => {
      const app = buildAdminApp(baseOptions({ hiddenModels: ['User'] }))
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'User')).toBe(false)
    })

    it('still shows Post when only User is hidden', async () => {
      const app = buildAdminApp(baseOptions({ hiddenModels: ['User'] }))
      const res = await request(app).get('/admin')
      const models: Array<{ name: string }> = res.body.props.models
      expect(models.some((m) => m.name === 'Post')).toBe(true)
    })
  })

  describe('AdminOptions shape', () => {
    it('does not have an adminEmails field', () => {
      const opts: AdminOptions = baseOptions()
      expect((opts as Record<string, unknown>)['adminEmails']).toBeUndefined()
    })
  })
})