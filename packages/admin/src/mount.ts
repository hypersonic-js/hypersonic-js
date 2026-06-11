import type { Application } from 'express'
import type { AdminOptions, PrismaClientLike } from './types.js'
import { createAdminAuthMiddleware } from './middleware/auth.js'
import { createAdminRouter } from './crud/router.js'

const DEFAULT_HIDDEN_MODELS = ['Session', 'Account', 'Verification', 'JwksKey']
const DEFAULT_PREFIX = '/admin'

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
  const router = createAdminRouter(prisma, models, prefix, options.meta, options.logger)

  app.use(prefix, authMiddleware, router)
}