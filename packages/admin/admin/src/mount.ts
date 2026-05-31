import type { Application } from 'express'
import type { AdminOptions, PrismaClientLike } from './types.js'
import { DEFAULT_PREFIX } from './constants.js'
import { parseDmmf } from './dmmf/parser.js'
import { createAdminAuthMiddleware } from './middleware/auth.js'
import { createAdminRouter } from './crud/router.js'

/**
 * Mounts the auto-generated admin dashboard onto an Express application.
 *
 * Call this after createApp() and before app.start():
 *
 * @example
 * ```ts
 * import { Prisma, PrismaClient } from '@prisma/client'
 * import { createApp, loadConfig } from '@hypersonic-js/core'
 * import { mountAdmin } from '@hypersonic-js/admin'
 *
 * const { config, env } = await loadConfig()
 * const prisma = new PrismaClient()
 * const app = await createApp({ config, env, prisma })
 *
 * mountAdmin(app.express, prisma, {
 *   dmmf: Prisma.dmmf,
 *   auth: app.auth,
 *   adminEmails: ['admin@example.com'],
 * })
 *
 * await app.start()
 * ```
 */
export function mountAdmin(
  app: Application,
  prisma: PrismaClientLike,
  options: AdminOptions,
): void {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const models = parseDmmf(options.dmmf, options)
  const authMiddleware = createAdminAuthMiddleware(options.auth, options.adminEmails)
  const router = createAdminRouter(prisma, models, prefix)

  app.use(prefix, authMiddleware, router)
}
