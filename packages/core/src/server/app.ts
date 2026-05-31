import express from 'express'
import { setPrismaClient } from '../database/client.js'
import { createAuth } from '../auth/setup.js'
import { mountAuth } from '../auth/middleware.js'
import { createInertiaMiddleware } from '../inertia/middleware.js'
import { createLifecycle } from './lifecycle.js'
import type { CreateAppOptions, HypersonicApp } from './types.js'
import type { Env } from '../config/env.js'
import type { HypersonicConfig } from '../config/types.js'

function resolveProviders(
  config: HypersonicConfig,
  env: Env,
): Record<string, { clientId: string; clientSecret: string }> | undefined {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {}
  const e = env as Record<string, string | undefined>

  if (config.auth.providers?.github === true) {
    providers['github'] = {
      clientId: e['GITHUB_CLIENT_ID'] as string,
      clientSecret: e['GITHUB_CLIENT_SECRET'] as string,
    }
  }

  if (config.auth.providers?.google === true) {
    providers['google'] = {
      clientId: e['GOOGLE_CLIENT_ID'] as string,
      clientSecret: e['GOOGLE_CLIENT_SECRET'] as string,
    }
  }

  return Object.keys(providers).length > 0 ? providers : undefined
}

/**
 * Creates and returns a fully wired Hypersonic application.
 * The auth instance created internally is returned on `app.auth` so
 * callers can pass it to route registration without creating a second instance.
 */
export async function createApp(options: CreateAppOptions): Promise<HypersonicApp> {
  const { config, env, prisma } = options

  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  setPrismaClient(prisma)

  const auth = createAuth({
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: config.auth.trustedOrigins,
    provider: config.database.provider,
    prisma,
    providers: resolveProviders(config, env),
  })
  mountAuth(app, auth)

  await createInertiaMiddleware(app, {
    ssr: config.inertia.ssr,
    version: config.inertia.version,
  })

  const { start, stop } = createLifecycle(app, config)

  return { express: app, auth, start, stop }
}