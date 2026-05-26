import { toNodeHandler } from 'better-auth/node'
import type { Application } from 'express'
import type { AuthInstance } from './setup.js'

/**
 * Mounts the Better Auth request handler on all /api/auth/* routes.
 * Must be called before Inertia middleware so auth routes are handled first.
 */
export function mountAuth(app: Application, auth: AuthInstance): void {
  // Express 5 uses named wildcard params — *splat captures everything after /api/auth/
  app.all('/api/auth/*splat', toNodeHandler(auth))
}
