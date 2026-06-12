import type { Application, Request, Response, NextFunction, RequestHandler } from 'express'
import type { InertiaPage, InertiaOptions } from './types.js'
import { randomBytes } from 'node:crypto'
import { createViteSetup } from './vite.js'
import { HttpError } from '../utils/errors.js'

const INERTIA_HEADER = 'x-inertia'
const INERTIA_VERSION_HEADER = 'x-inertia-version'
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'x-xsrf-token'
const CSRF_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Parses the raw Cookie request header into a key→value map.
 * Splits on ';', finds the first '=' in each pair, and URL-decodes the value.
 * Falls back to the raw value if decoding throws a URIError so that a single
 * malformed cookie cannot crash the middleware before CSRF validation runs.
 */
function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  const result: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) continue
    const key = pair.slice(0, eqIdx).trim()
    const raw = pair.slice(eqIdx + 1).trim()
    let value: string
    try {
      value = decodeURIComponent(raw)
    } catch {
      value = raw
    }
    result[key] = value
  }
  return result
}

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
    res.redirect(303, redirectUrl)
  }
}

/**
 * Mounts the Inertia middleware + Vite integration onto the Express app.
 * This must be called before routes are registered.
 *
 * Also installs two CSRF middlewares that apply to every route:
 *
 * - **csrfSetter** — sets the `XSRF-TOKEN` cookie only when the incoming
 *   request does not already carry one. Skipping rotation on subsequent
 *   requests prevents concurrent-tab races where a fresh token issued for
 *   Tab B would invalidate an in-flight form submission from Tab A.
 *
 * - **csrfValidator** — on POST/PUT/PATCH/DELETE requests, verifies that the
 *   `X-XSRF-TOKEN` request header matches the `XSRF-TOKEN` request cookie.
 *   Returns 419 if they are absent or do not match.
 *
 * Note: `/api/auth/*` routes are handled by Better Auth before reaching this
 * middleware, so they are naturally excluded from CSRF validation.
 */
export async function createInertiaMiddleware(
  app: Application,
  options: InertiaOptions,
): Promise<void> {
  const version = options.version ?? '1'
  const vite = await createViteSetup(options.ssr)

  // Mount Vite dev server or static file serving
  app.use(vite.middleware as RequestHandler)

  // CSRF token setter — writes the XSRF-TOKEN cookie only when the request
  // carries no existing token. This keeps the token stable across multiple
  // concurrent tabs / in-flight requests for the same session.
  // httpOnly must be false so the Inertia JS client can read it.
  const csrfSetter: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    const cookies = parseCookieHeader(req.headers.cookie)
    if (!cookies[CSRF_COOKIE]) {
      res.cookie(CSRF_COOKIE, generateCsrfToken(), {
        httpOnly: false,
        sameSite: 'strict',
        secure: process.env['NODE_ENV'] === 'production',
        path: '/',
      })
    }
    next()
  }

  // CSRF validator — rejects mutation requests where the X-XSRF-TOKEN header
  // does not match the XSRF-TOKEN cookie that was set on a prior response.
  const csrfValidator: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (!CSRF_MUTATION_METHODS.has(req.method)) {
      next()
      return
    }

    const cookies = parseCookieHeader(req.headers.cookie)
    const cookieToken = cookies[CSRF_COOKIE]
    const headerToken = req.headers[CSRF_HEADER]

    if (
      typeof cookieToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken !== headerToken
    ) {
      res.status(419).json({ error: 'CSRF token mismatch' })
      return
    }

    next()
  }

  app.use(csrfSetter)
  app.use(csrfValidator)

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