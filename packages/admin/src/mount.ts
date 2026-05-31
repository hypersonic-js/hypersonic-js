import type { Application } from 'express'
import type { AdminOptions, PrismaClientLike } from './types.js'
import { DEFAULT_PREFIX } from './constants.js'
import { parseDmmf } from './dmmf/parser.js'
import { createAdminAuthMiddleware } from './middleware/auth.js'
import { createAdminRouter } from './crud/router.js'

/**
 * Mounts the auto-generated admin dashboard onto an Express application.
 */
export function mountAdmin(
  app: Application,
  prisma: PrismaClientLike,
  options: AdminOptions,
): void {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const models = parseDmmf(options.dmmf, options)
  const authMiddleware = createAdminAuthMiddleware(options.auth)
  const router = createAdminRouter(prisma, models, prefix)

  app.use(prefix, authMiddleware, router)
}