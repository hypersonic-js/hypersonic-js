import type { RequestHandler, Request, Response, NextFunction } from 'express'
import type { AdminAuthLike } from '../types.js'

/**
 * Returns an Express middleware that validates a Better Auth session and checks
 * whether the authenticated user has the 'admin' role.
 */
export function createAdminAuthMiddleware(auth: AdminAuthLike): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    })

    if (session === null || session === undefined) {
      res.status(403).json({ error: 'Forbidden: no active session' })
      return
    }

    if (session.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: not an admin' })
      return
    }

    next()
  }
}