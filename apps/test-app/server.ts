import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createApp, loadConfig } from '@hypersonic/core'
import { mountAdmin } from '@hypersonic-js/admin'
import { registerRoutes } from './src/routes.ts'
import type { PrismaRouteClient } from './src/types.ts'

const { config, env } = await loadConfig()

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const app = await createApp({ config, env, prisma })

registerRoutes(app.express, prisma as unknown as PrismaRouteClient, app.auth)

mountAdmin(app.express, prisma, {
  dmmf: Prisma.dmmf,
  auth: app.auth,
})

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)