import { PrismaClient } from '@prisma/client'
import { createApp, loadConfig, createAuth, NotFoundError, UnauthorizedError } from '@hypersonic/core'
import type { Request, Response, NextFunction } from 'express'

const { config, env } = await loadConfig()
const prisma = new PrismaClient()

// Auth instance used for session checking in route guards.
// createApp creates its own internal instance for the /api/auth/* handler;
// this one shares the same secret + database so sessions are consistent.
const auth = createAuth({
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: config.auth.trustedOrigins,
  databaseUrl: env.DATABASE_URL,
  prisma,
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  sessionUser?: { id: string; name: string; email: string }
}

async function requireAuth(
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

// ─── App ──────────────────────────────────────────────────────────────────────

const app = await createApp({ config, env, prisma })
const { express: server } = app

// ─── Public routes ────────────────────────────────────────────────────────────

server.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

server.get('/login', (_req, res) => {
  res.inertia!('Auth/Login', {})
})

// ─── Protected routes ─────────────────────────────────────────────────────────

server.get('/posts', requireAuth, async (req: AuthRequest, res) => {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  })
  res.inertia!('Posts/Index', { posts, user: req.sessionUser })
})

server.get('/posts/:id', requireAuth, async (req: AuthRequest, res, next) => {
  const id = parseInt(req.params['id'] ?? '', 10)
  if (isNaN(id)) return next(new NotFoundError())

  const post = await prisma.post.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!post) return next(new NotFoundError('Post not found'))

  res.inertia!('Posts/Show', { post, user: req.sessionUser })
})

server.post('/posts', requireAuth, async (req: AuthRequest, res) => {
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

server.delete('/posts/:id', requireAuth, async (req: AuthRequest, res, next) => {
  const id = parseInt(req.params['id'] ?? '', 10)
  if (isNaN(id)) return next(new NotFoundError())

  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return next(new NotFoundError('Post not found'))

  if (post.userId !== req.sessionUser!.id) return next(new UnauthorizedError())

  await prisma.post.delete({ where: { id } })
  res.redirect('/posts')
})

// ─── Start ────────────────────────────────────────────────────────────────────

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)