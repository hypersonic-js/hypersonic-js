import type { Application, Request, Response, NextFunction } from 'express'
import { HttpError, NotFoundError, UnauthorizedError } from '@hypersonic/core'
import { createAuthGuard } from './middleware.js'
import type { AuthLike, AuthRequest, PrismaRouteClient } from './types.js'

function parseId(raw: string | string[] | undefined): number {
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return parseInt(str, 10)
}

/**
 * Registers all application routes and the error handler onto an Express app.
 * Accepts injected prisma and auth instances so tests can substitute mocks.
 */
export function registerRoutes(
  app: Application,
  prisma: PrismaRouteClient,
  auth: AuthLike,
): void {
  const requireAuth = createAuthGuard(auth)

  // ─── Public ────────────────────────────────────────────────────────────────

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  app.get('/login', (_req: Request, res: Response) => {
    res.inertia!('Auth/Login', {})
  })

  // ─── Protected ─────────────────────────────────────────────────────────────

  app.get('/posts', requireAuth, async (req: AuthRequest, res: Response) => {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })
    res.inertia!('Posts/Index', { posts, user: req.sessionUser })
  })

  app.get(
    '/posts/:id',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      const id = parseId(req.params['id'])
      if (isNaN(id)) return next(new NotFoundError())

      const post = await prisma.post.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true } } },
      })
      if (!post) return next(new NotFoundError('Post not found'))

      res.inertia!('Posts/Show', { post, user: req.sessionUser })
    },
  )

  app.post('/posts', requireAuth, async (req: AuthRequest, res: Response) => {
    const { title, body } = req.body as { title?: string; body?: string }

    await prisma.post.create({
      data: {
        title: title ?? '',
        body: body ?? '',
        userId: req.sessionUser!.id,
      },
    })

    res.redirect('/posts')
  })

  app.delete(
    '/posts/:id',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      const id = parseId(req.params['id'])
      if (isNaN(id)) return next(new NotFoundError())

      const post = await prisma.post.findUnique({ where: { id } })
      if (!post) return next(new NotFoundError('Post not found'))

      if (post.userId !== req.sessionUser!.id) return next(new UnauthorizedError())

      await prisma.post.delete({ where: { id } })
      res.redirect('/posts')
    },
  )

  // ─── Error handler ─────────────────────────────────────────────────────────

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const httpErr = err instanceof HttpError ? err : null
    const status = httpErr ? httpErr.statusCode : 500
    const message = httpErr ? httpErr.message : 'Internal Server Error'
    res.status(status).json({ error: message })
  })
}