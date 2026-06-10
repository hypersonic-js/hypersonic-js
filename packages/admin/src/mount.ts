import type { Application } from 'express'
import type { AdminOptions, PrismaClientLike } from './types.js'

const DEFAULT_HIDDEN_MODELS = ['Session', 'Account', 'Verification', 'JwksKey']
const DEFAULT_PREFIX = '/admin'

function createAdminAuthMiddleware(auth: AdminOptions['auth']) {
  return async (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const session = await auth.api.getSession({ headers: req.headers })
    if (session === null || session === undefined || session.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

import { createAdminRouter } from './crud/router.js'

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
  const router = createAdminRouter(prisma, models, prefix, options.meta)

  app.use(prefix, authMiddleware, router)
}