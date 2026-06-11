import { Router } from 'express'
import type { Response, Request, NextFunction, ErrorRequestHandler } from 'express'
import type { PrismaClientLike, AdminModelMeta, LoggerLike, AdminAuthLike } from '../types.js'
import {
  findMany,
  countRecords,
  findUnique,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchRelatedOptions,
  coerceData,
  type RelatedOption,
} from './query.js'
import { parsePaginationParams, buildPaginationMeta } from './pagination.js'
import { MAX_RELATED_OPTIONS } from '../constants.js'

/** Minimal nav item passed to every Inertia page for the sidebar. */
interface NavModel {
  name: string
  urlSlug: string
}

type InertiaResponse = Response & {
  inertia?: (component: string, props?: Record<string, unknown>) => void
}

/** Shape of a single FK field's options bundle passed to Inertia and the JSON endpoint. */
interface RelatedOptionsBundle {
  options: RelatedOption[]
  hasMore: boolean
}

/** Optional configuration for createAdminRouter. */
export interface AdminRouterOptions {
  /**
   * Full unfiltered model metadata — used when fetching FK dropdown options so
   * hidden models (e.g. User when showAuthModels is false) can still be queried.
   * Defaults to `models`.
   */
  allMeta?: AdminModelMeta[]
  /** Optional structured logger. Pass `app.logger` from createApp(). */
  logger?: LoggerLike
  /**
   * Better Auth instance. When `auth.api.createUser` is present the router
   * routes User model mutations through the Better Auth admin API instead of
   * calling Prisma directly.
   */
  auth?: AdminAuthLike
  /**
   * Name of the Better Auth user model in your Prisma schema.
   * Defaults to `'User'`.
   */
  betterAuthUserModel?: string
}

/**
 * Fetches the first page of <select> options for every FK field in the model's
 * formFields. Uses allMeta (the full unfiltered metadata) so hidden models (e.g.
 * User when showAuthModels is false) can still be queried for their dropdown values.
 *
 * Returns a map of { [fkFieldName]: { options, hasMore } }.
 */
async function buildRelatedOptions(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  allMeta: AdminModelMeta[],
): Promise<Record<string, RelatedOptionsBundle>> {
  const fkFields = model.formFields.filter(
    (f) => f.isForeignKey && f.relatedModelName !== undefined,
  )
  if (fkFields.length === 0) return {}

  const entries = await Promise.all(
    fkFields.map(async (f) => {
      const relatedMeta = allMeta.find((m) => m.name === f.relatedModelName)
      if (relatedMeta === undefined) return [f.name, { options: [], hasMore: false }] as const
      const options = await fetchRelatedOptions(prisma, relatedMeta, 0)
      return [f.name, { options, hasMore: options.length === MAX_RELATED_OPTIONS }] as const
    }),
  )

  return Object.fromEntries(entries)
}

/**
 * Builds an Express Router containing all admin CRUD routes.
 * The router should be mounted at the admin prefix via app.use(prefix, authMiddleware, router).
 *
 * @param prisma   Prisma client instance.
 * @param models   Filtered model list (nav-visible models only).
 * @param prefix   Route prefix the router is mounted at.
 * @param options  Optional configuration — see AdminRouterOptions.
 *
 * Routes (all relative to mount prefix):
 *   GET  /                              -> Admin/Dashboard
 *   GET  /related-options/:relatedModel -> JSON { options, hasMore } for FK load-more
 *   GET  /:model                        -> Admin/ModelIndex  (paginated list)
 *   GET  /:model/new                    -> Admin/ModelForm   (create form)
 *                                          Admin/UserCreate  (when Better Auth user model)
 *   GET  /:model/:id                    -> Admin/ModelForm   (edit form)
 *   POST /:model                        -> create record, redirect to list
 *   PATCH /:model/:id                   -> update record, redirect to list
 *   DELETE /:model/:id                  -> delete record, redirect to list
 */
export function createAdminRouter(
  prisma: PrismaClientLike,
  models: AdminModelMeta[],
  prefix: string,
  options: AdminRouterOptions = {},
): Router {
  const { allMeta = models, logger, auth, betterAuthUserModel = 'User' } = options

  const router = Router()

  const modelMap = new Map<string, AdminModelMeta>(models.map((m) => [m.urlSlug, m]))
  const allMetaMap = new Map<string, AdminModelMeta>(allMeta.map((m) => [m.urlSlug, m]))

  const navModels: NavModel[] = models.map((m) => ({ name: m.name, urlSlug: m.urlSlug }))

  // Detect if Better Auth user management is available.
  // When auth.api.createUser exists the named user model's create / update /
  // delete routes are handled by the Better Auth admin API instead of Prisma.
  const betterAuthMeta: AdminModelMeta | undefined =
    auth?.api?.createUser !== undefined
      ? models.find((m) => m.name === betterAuthUserModel)
      : undefined

  // GET / -- Dashboard
  router.get('/', async (_req, res: InertiaResponse, next: NextFunction) => {
    try {
      const modelCounts = await Promise.all(
        models.map(async (m) => {
          const count = await countRecords(prisma, m)
          return { name: m.name, urlSlug: m.urlSlug, recordCount: count }
        }),
      )
      res.inertia!('Admin/Dashboard', { models: modelCounts, prefix })
    } catch (err) {
      next(err)
    }
  })

  // GET /related-options/:relatedModel -- paginated FK dropdown options
  // Registered before /:model/* routes so the literal "related-options" segment
  // is matched before any dynamic model slug.
  router.get('/related-options/:relatedModel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meta = allMetaMap.get(req.params['relatedModel'] as string)
      if (meta === undefined) { res.status(404).json({ error: 'Not Found' }); return }

      const rawPage = Number(req.query['page'] ?? 1)
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
      const skip = (page - 1) * MAX_RELATED_OPTIONS

      const options_ = await fetchRelatedOptions(prisma, meta, skip)
      const hasMore = options_.length === MAX_RELATED_OPTIONS

      res.json({ options: options_, hasMore })
    } catch (err) {
      next(err)
    }
  })

  // ── Better Auth user model routes ─────────────────────────────────────────
  // Registered BEFORE the generic /:model/* routes so they take precedence.
  // Only active when auth.api.createUser is present and the user model is
  // visible in the nav. GET /:model (index) and GET /:model/:id (edit) are
  // intentionally NOT overridden — listing and editing continue via Prisma.

  if (betterAuthMeta !== undefined) {
    const userSlug = betterAuthMeta.urlSlug
    const userRoles = betterAuthMeta.formFields
      .find((f) => f.name === 'role')
      ?.enumValues ?? []

    // GET /:userSlug/new -- bespoke user create form
    router.get(`/${userSlug}/new`, async (_req: Request, res: InertiaResponse, next: NextFunction) => {
      try {
        res.inertia!('Admin/UserCreate', {
          model: betterAuthMeta,
          roles: userRoles,
          errors: {},
          models: navModels,
          prefix,
        })
      } catch (err) {
        next(err)
      }
    })

    // POST /:userSlug -- create user via Better Auth admin API
    router.post(`/${userSlug}`, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, string>
        await auth!.api.createUser!({
          body: {
            name: body['name'] ?? '',
            email: body['email'] ?? '',
            password: body['password'] ?? '',
            role: body['role'] !== '' ? body['role'] : undefined,
          },
        })
        res.redirect(303, `${prefix}/${userSlug}`)
      } catch (err) {
        next(err)
      }
    })

    // PATCH /:userSlug/:id -- update user via Better Auth admin API
    // Forwards the incoming request headers so Better Auth can validate the
    // calling admin's session for permission checks.
    router.patch(`/${userSlug}/:id`, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.params['id'] as string
        const coerced = coerceData(req.body as Record<string, unknown>, betterAuthMeta)
        await auth!.api.adminUpdateUser!({
          body: { userId, data: coerced },
          headers: req.headers,
        })
        res.redirect(303, `${prefix}/${userSlug}`)
      } catch (err) {
        next(err)
      }
    })

    // DELETE /:userSlug/:id -- delete user via Better Auth admin API
    // Better Auth's removeUser also revokes all active sessions for the user,
    // which plain prisma.user.delete would not do.
    router.delete(`/${userSlug}/:id`, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.params['id'] as string
        await auth!.api.removeUser!({
          body: { userId },
          headers: req.headers,
        })
        res.redirect(303, `${prefix}/${userSlug}`)
      } catch (err) {
        next(err)
      }
    })
  }

  // ── Generic CRUD routes ───────────────────────────────────────────────────

  // GET /:model -- Model index (paginated list)
  router.get('/:model', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { res.status(404).json({ error: 'Not Found' }); return }

      const pagination = parsePaginationParams(req.query)
      const { records, total } = await findMany(prisma, model, pagination)
      const paginationMeta = buildPaginationMeta(pagination.page, pagination.perPage, total)

      res.inertia!('Admin/ModelIndex', {
        model,
        records,
        pagination: paginationMeta,
        models: navModels,
        prefix,
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:model/new -- Create form
  router.get('/:model/new', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { res.status(404).json({ error: 'Not Found' }); return }

      const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)

      res.inertia!('Admin/ModelForm', {
        model,
        record: null,
        relatedOptions,
        errors: {},
        models: navModels,
        prefix,
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /:model/:id -- Edit form
  router.get('/:model/:id', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { res.status(404).json({ error: 'Not Found' }); return }

      const record = await findUnique(prisma, model, req.params['id'] as string)
      if (record === null) { res.status(404).json({ error: 'Not Found' }); return }

      const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)

      res.inertia!('Admin/ModelForm', {
        model,
        record,
        relatedOptions,
        errors: {},
        models: navModels,
        prefix,
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /:model -- Create
  router.post('/:model', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }

      await createRecord(prisma, model, req.body as Record<string, unknown>)
      res.redirect(303, `${prefix}/${model.urlSlug}`)
    } catch (err) {
      next(err)
    }
  })

  // PATCH /:model/:id -- Update
  router.patch('/:model/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }

      await updateRecord(prisma, model, req.params['id'] as string, req.body as Record<string, unknown>)
      res.redirect(303, `${prefix}/${model.urlSlug}`)
    } catch (err) {
      next(err)
    }
  })

  // DELETE /:model/:id -- Delete
  router.delete('/:model/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }

      await deleteRecord(prisma, model, req.params['id'] as string)
      res.redirect(303, `${prefix}/${model.urlSlug}`)
    } catch (err) {
      next(err)
    }
  })

  // Error handler — logs the error then either redirects back (Inertia) or
  // returns a clean 500 without leaking internal details.
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    logger?.error(
      { err, method: req.method, url: req.url },
      'Admin request error',
    )

    if (req.headers['x-inertia']) {
      const referer = req.headers['referer']
      const redirectUrl =
        typeof referer === 'string' && referer.length > 0 ? referer : `${prefix}/`
      res.redirect(303, redirectUrl)
      return
    }
    res.status(500).json({ error: 'Internal Server Error' })
  }

  router.use(errorHandler)

  return router
}