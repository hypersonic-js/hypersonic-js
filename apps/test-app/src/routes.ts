import type { Application, Request, Response, NextFunction, RequestHandler } from 'express'
import { HttpError, NotFoundError, UnauthorizedError, createInertiaErrorHandler } from '@hypersonic-js/core'
import { createAuthGuard } from './middleware.ts'
import type { AuthLike, AuthRequest, PrismaRouteClient } from './types.ts'

/** Parses a route param string (or first element of a string array) into an integer. */
export function parseId(raw: string | string[] | undefined): number {
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return parseInt(str, 10)
}

/** Default middleware used when no rate limiter is supplied — passes through unconditionally. */
const noopMiddleware: RequestHandler = (_req, _res, next) => next()

/** Optional middleware injected onto specific routes by registerRoutes. */
export interface RegisterRoutesOptions {
  /**
   * Rate-limiting middleware applied to `POST /posts` only, ahead of the auth
   * guard so unauthenticated abuse is also throttled. Defaults to a no-op so
   * existing callers (and existing tests) are unaffected when omitted.
   */
  postsLimiter?: RequestHandler
}

/**
 * Registers all application routes and the error handler onto an Express app.
 * Accepts injected prisma and auth instances so tests can substitute mocks.
 */
export function registerRoutes(
  app: Application,
  prisma: PrismaRouteClient,
  auth: AuthLike,
  options: RegisterRoutesOptions = {},
): void {
  const requireAuth = createAuthGuard(auth)
  const postsLimiter = options.postsLimiter ?? noopMiddleware

  // ─── Public ────────────────────────────────────────────────────────────────
  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/posts')
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  app.get('/login', (_req: Request, res: Response) => {
    res.inertia!('Auth/Login', {})
  })

  app.get('/register', (_req: Request, res: Response) => {
    res.inertia!('Auth/Register', {})
  })

  // ─── Protected ─────────────────────────────────────────────────────────────

  app.get('/posts', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const posts = await prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      })
      res.inertia!('Posts/Index', { posts, user: req.sessionUser })
    } catch (err) {
      next(err)
    }
  })

  app.get(
    '/posts/:id',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parseId(req.params['id'])
        if (isNaN(id)) return next(new NotFoundError())

        const post = await prisma.post.findUnique({
          where: { id },
          include: { user: { select: { id: true, name: true } } },
        })
        if (!post) return next(new NotFoundError('Post not found'))

        res.inertia!('Posts/Show', { post, user: req.sessionUser })
      } catch (err) {
        next(err)
      }
    },
  )

  app.post(
    '/posts',
    postsLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const { title, body } = req.body as { title?: string; body?: string }

        await prisma.post.create({
          data: {
            title: title ?? '',
            body: body ?? '',
            userId: req.sessionUser!.id,
          },
        })
        res.redirect('/posts')
      } catch (err) {
        next(err)
      }
    },
  )

  app.delete(
    '/posts/:id',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parseId(req.params['id'])
        if (isNaN(id)) return next(new NotFoundError())

        const post = await prisma.post.findUnique({ where: { id } })
        if (!post) return next(new NotFoundError('Post not found'))
        if (post.userId !== req.sessionUser!.id) return next(new UnauthorizedError())

        await prisma.post.delete({ where: { id } })
        res.redirect(303, '/posts')
      } catch (err) {
        next(err)
      }
    },
  )

  // ─── Error handlers ────────────────────────────────────────────────────────

  // For Inertia requests: redirect back instead of returning plain JSON
  app.use(createInertiaErrorHandler())

  // Fallback: plain JSON for non-Inertia requests (API clients, tests)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Internal Server Error' })
  })
}