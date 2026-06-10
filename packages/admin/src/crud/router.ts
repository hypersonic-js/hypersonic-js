import { Router } from 'express'
import type { Response, Request } from 'express'
import type { PrismaClientLike, AdminModelMeta } from '../types.js'
import {
  findMany,
  countRecords,
  findUnique,
  createRecord,
  updateRecord,
  deleteRecord,
  fetchRelatedOptions,
} from './query.js'
import { parsePaginationParams, buildPaginationMeta } from './pagination.js'

/** Minimal nav item passed to every Inertia page for the sidebar. */
interface NavModel {
  name: string
  urlSlug: string
}

type InertiaResponse = Response & {
  inertia?: (component: string, props?: Record<string, unknown>) => void
}

/**
 * Fetches <select> options for every FK field present in the model's formFields.
 * Uses allMeta (the full unfiltered metadata) so hidden models (e.g. User when
 * showAuthModels is false) can still be queried for their dropdown values.
 *
 * Returns a map of { [fkFieldName]: RelatedOption[] }.
 */
async function buildRelatedOptions(
  prisma: PrismaClientLike,
  model: AdminModelMeta,
  allMeta: AdminModelMeta[],
): Promise<Record<string, { id: unknown; label: string }[]>> {
  const fkFields = model.formFields.filter(
    (f) => f.isForeignKey && f.relatedModelName !== undefined,
  )
  if (fkFields.length === 0) return {}

  const entries = await Promise.all(
    fkFields.map(async (f) => {
      const relatedMeta = allMeta.find((m) => m.name === f.relatedModelName)
      if (relatedMeta === undefined) return [f.name, []] as const
      const options = await fetchRelatedOptions(prisma, relatedMeta)
      return [f.name, options] as const
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
 *   GET  /                  → Admin/Dashboard
 *   GET  /:model            → Admin/ModelIndex  (paginated list)
 *   GET  /:model/new        → Admin/ModelForm   (create form)
 *   GET  /:model/:id        → Admin/ModelForm   (edit form)
 *   POST /:model            → create record, redirect to list
 *   PATCH /:model/:id       → update record, redirect to list
 *   DELETE /:model/:id      → delete record, redirect to list
 */
export function createAdminRouter(
  prisma: PrismaClientLike,
  models: AdminModelMeta[],
  prefix: string,
  allMeta: AdminModelMeta[] = models,
): Router {
  const router = Router()

  const modelMap = new Map<string, AdminModelMeta>(models.map((m) => [m.urlSlug, m]))

  const navModels: NavModel[] = models.map((m) => ({ name: m.name, urlSlug: m.urlSlug }))

  // GET / — Dashboard
  router.get('/', async (_req, res: InertiaResponse) => {
    const modelCounts = await Promise.all(
      models.map(async (m) => {
        const count = await countRecords(prisma, m)
        return { name: m.name, urlSlug: m.urlSlug, recordCount: count }
      }),
    )
    res.inertia!('Admin/Dashboard', { models: modelCounts, prefix })
  })

  // GET /:model/new — Create form
  // Must be registered BEFORE /:model/:id so "new" is not matched as an id.
  router.get('/:model/new', async (req: Request, res: InertiaResponse, next) => {
    const model = modelMap.get(req.params['model'] as string)
    if (model === undefined) { next(); return }
    const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)
    res.inertia!('Admin/ModelForm', { model, record: null, models: navModels, errors: {}, prefix, relatedOptions })
  })

  // GET /:model/:id — Edit form
  router.get('/:model/:id', async (req: Request, res: InertiaResponse, next) => {
    const model = modelMap.get(req.params['model'] as string)
    if (model === undefined) { next(); return }

    const record = await findUnique(prisma, model, req.params['id'] as string)
    if (record === null || record === undefined) { next(); return }

    const relatedOptions = await buildRelatedOptions(prisma, model, allMeta)
    res.inertia!('Admin/ModelForm', { model, record, models: navModels, errors: {}, prefix, relatedOptions })
  })

  // GET /:model — Paginated list
  router.get('/:model', async (req: Request, res: InertiaResponse, next) => {
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
  })

  // POST /:model — Create
  router.post('/:model', async (req: Request, res, next) => {
    const model = modelMap.get(req.params['model'] as string)
    if (model === undefined) { next(); return }

    await createRecord(prisma, model, req.body as Record<string, unknown>)
    res.redirect(303, `${prefix}/${model.urlSlug}`)
  })

  // PATCH /:model/:id — Update
  router.patch('/:model/:id', async (req: Request, res, next) => {
    const model = modelMap.get(req.params['model'] as string)
    if (model === undefined) { next(); return }

    await updateRecord(prisma, model, req.params['id'] as string, req.body as Record<string, unknown>)
    res.redirect(303, `${prefix}/${model.urlSlug}`)
  })

  // DELETE /:model/:id — Delete
  router.delete('/:model/:id', async (req: Request, res, next) => {
    const model = modelMap.get(req.params['model'] as string)
    if (model === undefined) { next(); return }

    await deleteRecord(prisma, model, req.params['id'] as string)
    res.redirect(303, `${prefix}/${model.urlSlug}`)
  })

  return router
}