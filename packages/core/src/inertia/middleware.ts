import type { Application, Request, Response, NextFunction, RequestHandler } from 'express'
import type { InertiaPage, InertiaOptions } from './types.js'
import { createViteSetup } from './vite.js'
import { HttpError } from '../utils/errors.js'

const INERTIA_HEADER = 'x-inertia'
const INERTIA_VERSION_HEADER = 'x-inertia-version'

function escapeJson(str: string): string {
  return str
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/'/g, '\\u0027')
}

function buildHtml(page: InertiaPage, assetTags: string): string {
  const pageJson = escapeJson(JSON.stringify(page))
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${assetTags}
  </head>
  <body>
    <script type="application/json" data-page="app">${pageJson}</script>
    <div id="app"></div>
  </body>
</html>`
}

/**
 * Returns an error-handling middleware that intercepts HttpErrors on Inertia
 * requests and redirects back to the referring page (or '/' as a fallback)
 * instead of returning a plain JSON response that Inertia cannot render.
 *
 * Register this AFTER your routes and BEFORE your plain-JSON error handler so
 * that the Inertia client always receives a redirect it can follow.
 *
 * @example
 * ```ts
 * registerRoutes(app, prisma, auth)        // your routes
 * app.use(createInertiaErrorHandler())     // Inertia-aware errors
 * app.use(plainJsonErrorHandler)           // fallback for non-Inertia
 * ```
 */
export function createInertiaErrorHandler(): (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (!(err instanceof HttpError) || !req.headers[INERTIA_HEADER]) {
      next(err)
      return
    }

    const referer = req.headers['referer']
    const redirectUrl = typeof referer === 'string' && referer.length > 0 ? referer : '/'
    res.redirect(redirectUrl)
  }
}

/**
 * Mounts the Inertia middleware + Vite integration onto the Express app.
 * This must be called before routes are registered.
 */
export async function createInertiaMiddleware(
  app: Application,
  options: InertiaOptions,
): Promise<void> {
  const version = options.version ?? '1'
  const vite = await createViteSetup(options.ssr)

  // Mount Vite dev server or static file serving
  app.use(vite.middleware as RequestHandler)

  // Inertia protocol middleware
  const inertiaMiddleware: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const isInertiaRequest = Boolean(req.headers[INERTIA_HEADER])

    // Asset version mismatch — force a full page reload
    if (
      isInertiaRequest &&
      req.method === 'GET' &&
      req.headers[INERTIA_VERSION_HEADER] !== version
    ) {
      res.setHeader('X-Inertia-Location', req.url)
      res.status(409).end()
      return
    }

    res.inertia = (component: string, props: Record<string, unknown> = {}): void => {
      const page: InertiaPage = {
        component,
        props,
        url: req.originalUrl,
        version,
      }

      if (isInertiaRequest) {
        res.setHeader('X-Inertia', 'true')
        res.setHeader('Vary', 'X-Inertia')
        res.status(200).json(page)
        return
      }

      const html = buildHtml(page, vite.assetTags())
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.status(200).send(html)
    }

    next()
  }

  app.use(inertiaMiddleware)
}