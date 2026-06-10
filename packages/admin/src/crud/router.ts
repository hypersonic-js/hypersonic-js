import { Router } from 'express'
import type { Response, Request, NextFunction, ErrorRequestHandler } from 'express'
import type { PrismaClientLike, AdminModelMeta } from '../types.js'
import {
  findMany,
  countRecords,
  findUnique,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchRelatedOptions,
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
 * @param prisma    Prisma client instance.
 * @param models    Filtered model list (nav-visible models only).
 * @param prefix    Route prefix the router is mounted at.
 * @param allMeta   Full unfiltered model metadata — used when fetching FK
 *                  dropdown options so hidden models (e.g. User) can still be
 *                  queried even when not shown in the nav. Defaults to models.
 *
 * Routes (all relative to mount prefix):
 *   GET  /                              -> Admin/Dashboard
 *   GET  /related-options/:relatedModel -> JSON { options, hasMore } for FK load-more
 *   GET  /:model                        -> Admin/ModelIndex  (paginated list)
 *   GET  /:model/new                    -> Admin/ModelForm   (create form)
 *   GET  /:model/:id                    -> Admin/ModelForm   (edit form)
 *   POST /:model                        -> create record, redirect to list
 *   PATCH /:model/:id                   -> update record, redirect to list
 *   DELETE /:model/:id                  -> delete record, redirect to list
 */
export function createAdminRouter(
  prisma: PrismaClientLike,
  models: AdminModelMeta[],
  prefix: string,
  allMeta: AdminModelMeta[] = models,
): Router {
  const router = Router()

  const modelMap = new Map<string, AdminModelMeta>(models.map((m) => [m.urlSlug, m]))
  const allMetaMap = new Map<string, AdminModelMeta>(allMeta.map((m) => [m.urlSlug, m]))

  const navModels: NavModel[] = models.map((m) => ({ name: m.name, urlSlug: m.urlSlug }))

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
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
      const skip = (page - 1) * MAX_RELATED_OPTIONS

      const options = await fetchRelatedOptions(prisma, meta, skip)
      res.json({ options, hasMore: options.length === MAX_RELATED_OPTIONS })
    } catch (err) {
      next(err)
    }
  })

  // GET /:model/new -- Create form
  // Must be registered BEFORE /:model/:id so "new" is not matched as an id.
  router.get('/:model/new', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }
      const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)
      res.inertia!('Admin/ModelForm', { model, record: null, models: navModels, errors: {}, prefix, relatedOptions })
    } catch (err) {
      next(err)
    }
  })

  // GET /:model/:id -- Edit form
  router.get('/:model/:id', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }

      const record = await findUnique(prisma, model, req.params['id'] as string)
      if (record === null || record === undefined) { next(); return }

      const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)
      res.inertia!('Admin/ModelForm', { model, record, models: navModels, errors: {}, prefix, relatedOptions })
    } catch (err) {
      next(err)
    }
  })

  // GET /:model -- Paginated list
  router.get('/:model', async (req: Request, res: InertiaResponse, next: NextFunction) => {
    try {
      const model = modelMap.get(req.params['model'] as string)
      if (model === undefined) { next(); return }

      const pagination = parsePaginationParams(req.query as Record<string, unknown>)
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

  // Error handler -- returns a clean 500 without leaking internals
  const errorHandler: ErrorRequestHandler = (_err, _req, res, _next) => {
    res.status(500).json({ error: 'Internal Server Error' })
  }
  router.use(errorHandler)

  return router
}