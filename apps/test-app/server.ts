import { PrismaClient } from '@prisma/client'
import { createApp, loadConfig, createAuth } from '@hypersonic/core'
import { registerRoutes } from './src/routes.js'

const { config, env } = await loadConfig()
const prisma = new PrismaClient()

// Auth instance for session checking in route guards.
// createApp creates its own internal instance for /api/auth/*;
// this one shares the same secret + database so sessions are consistent.
const auth = createAuth({
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: config.auth.trustedOrigins,
  databaseUrl: env.DATABASE_URL,
  prisma,
})

const app = await createApp({ config, env, prisma })

registerRoutes(app.express, prisma, auth)

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)