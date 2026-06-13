import 'dotenv/config'
import { createRequire } from 'node:module'
import type { PrismaClient as PrismaClientType } from '@prisma/client'
import {
  createApp,
  loadConfig,
  createDatabaseAdapter,
  createInertiaErrorHandler,
  mountAdmin,
} from '@hypersonic-js/complete'
import type { AdminModelMeta } from '@hypersonic-js/complete'
import { createAuthGuard } from './src/middleware.ts'

// PrismaClient is CommonJS — use createRequire to load it in an ESM context.
const require = createRequire(import.meta.url)
const adminMeta = require('./prisma/admin-meta.json') as AdminModelMeta[]
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: typeof PrismaClientType
}

const { config, env } = await loadConfig()

// Prisma v7 requires a driver adapter — never instantiate PrismaClient bare.
const adapter = await createDatabaseAdapter(config.database.provider, env.DATABASE_URL)
const prisma = new PrismaClient({ adapter })

const app = await createApp({ config, env, prisma })

// ── Auth guard (use on any route you want to protect) ──────────────────────

const requireAuth = createAuthGuard(app.auth)

// ── Public routes ──────────────────────────────────────────────────────────

app.express.get('/', (_req, res) => {
  res.inertia!('Welcome', {
    routes: [
      { path: '/login', description: 'Sign in to your account' },
      { path: '/register', description: 'Create a new account' },
      { path: '/admin', description: 'Admin dashboard (admin role required)' },
    ],
  })
})

app.express.get('/login', (_req, res) => {
  res.inertia!('Auth/Login', {})
})

app.express.get('/register', (_req, res) => {
  res.inertia!('Auth/Register', {})
})

// ── Protected routes — example ─────────────────────────────────────────────
// app.express.get('/dashboard', requireAuth, (req, res) => {
//   res.inertia!('Dashboard', { user: req.sessionUser })
// })

// ── Admin ───────────────────────────────────────────────────────────────────

mountAdmin(app.express, prisma, {
  meta: adminMeta,
  auth: app.auth,
  logger: app.logger,
})

app.express.use(createInertiaErrorHandler())

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)

export { requireAuth }