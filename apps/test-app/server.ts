import 'dotenv/config'
import { createRequire } from 'node:module'
import { PrismaClient } from '@prisma/client'
import { createApp, loadConfig, createDatabaseAdapter } from '@hypersonic-js/core'
import { mountAdmin } from '@hypersonic-js/admin'
import type { AdminModelMeta } from '@hypersonic-js/admin'
import { registerRoutes } from './src/routes.ts'
import type { PrismaRouteClient } from './src/types.ts'

const require = createRequire(import.meta.url)
const adminMeta = require('./prisma/admin-meta.json') as AdminModelMeta[]

const { config, env } = await loadConfig()

const adapter = await createDatabaseAdapter(config.database.provider, env.DATABASE_URL)
const prisma = new PrismaClient({ adapter })

const app = await createApp({ config, env, prisma })

registerRoutes(app.express, prisma as unknown as PrismaRouteClient, app.auth)

mountAdmin(app.express, prisma, {
  meta: adminMeta,
  auth: app.auth,
})

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)