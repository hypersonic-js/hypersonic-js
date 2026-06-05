import type { Application } from 'express'
import type { AdminOptions, PrismaClientLike } from './types.js'
import { DEFAULT_HIDDEN_MODELS, DEFAULT_PREFIX } from './constants.js'
import { createAdminAuthMiddleware } from './middleware/auth.js'
import { createAdminRouter } from './crud/router.js'

/**
 * Mounts the auto-generated admin dashboard onto an Express application.
 * Filters models at runtime using showAuthModels and hiddenModels options.
 */
export function mountAdmin(
  app: Application,
  prisma: PrismaClientLike,
  options: AdminOptions,
): void {
  const prefix = options.prefix ?? DEFAULT_PREFIX

  const hidden = new Set<string>([
    ...(options.showAuthModels === true ? [] : DEFAULT_HIDDEN_MODELS),
    ...(options.hiddenModels ?? []),
  ])
  const models = options.meta.filter((m) => !hidden.has(m.name))

  const authMiddleware = createAdminAuthMiddleware(options.auth)
  const router = createAdminRouter(prisma, models, prefix)

  app.use(prefix, authMiddleware, router)
}