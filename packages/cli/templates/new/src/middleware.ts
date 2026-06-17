import type { Response, NextFunction, RequestHandler } from 'express'
import type { AuthLike, AuthRequest } from './types.js'

/**
 * Returns a middleware that checks for a valid Better Auth session.
 * Redirects to /login when the session is absent.
 * Attaches session.user to req.sessionUser on success.
 */
export function createAuthGuard(auth: AuthLike): RequestHandler {
  return async function requireAuth(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    })

    if (!session) {
      res.redirect('/login')
      return
    }

    req.sessionUser = session.user
    next()
  }
}