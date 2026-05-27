import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createApp, loadConfig, createAuth } from '@hypersonic/core'
import { registerRoutes } from './src/routes.ts'

const { config, env } = await loadConfig()

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

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