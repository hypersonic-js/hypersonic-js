import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { RequestHandler } from 'express'
import { setPrismaClient } from '../database/client.js'
import { createAuth } from '../auth/setup.js'
import { mountAuth } from '../auth/middleware.js'
import { createInertiaMiddleware } from '../inertia/middleware.js'
import { createLifecycle } from './lifecycle.js'
import { createLogger } from '../logger/index.js'
import type { CreateAppOptions, HypersonicApp } from './types.js'
import type { Env } from '../config/env.js'
import type { HypersonicConfig } from '../config/types.js'
import type { AuthRateLimitOptions, BetterAuthSecondaryStorage } from '../auth/types.js'

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
 * Resolves Better Auth's rate-limit config from the injected `limitsPlugin`.
 *
 * `core` never imports `@hypersonic-js/limits` — the caller passes the
 * resolver in (see `CreateAppOptions.limitsPlugin`). When `config.limits` is
 * set but no plugin was provided, this throws immediately with a descriptive
 * error rather than silently ignoring the config block.
 */
async function resolveLimitsAuthConfig(options: CreateAppOptions): Promise<{
  rateLimit?: AuthRateLimitOptions
  secondaryStorage?: BetterAuthSecondaryStorage
  close?: () => Promise<void>
}> {
  const { config, env, prisma, limitsPlugin } = options

  if (config.limits === undefined) return {}

  if (limitsPlugin === undefined) {
    throw new Error(
      'Hypersonic: config.limits is set but no limitsPlugin was passed to createApp.\n' +
        'Import buildAuthLimitsConfig from @hypersonic-js/limits and pass it in:\n' +
        "  import { buildAuthLimitsConfig } from '@hypersonic-js/limits'\n" +
        '  createApp({ config, env, prisma, limitsPlugin: buildAuthLimitsConfig })',
    )
  }

  return limitsPlugin(config.limits, env, prisma)
}

/**
 * Creates and returns a fully wired Hypersonic application.
 * The auth instance created internally is returned on `app.auth` so
 * callers can pass it to route registration without creating a second instance.
 * The Pino logger is returned on `app.logger` and can be passed to mountAdmin
 * or used directly in route handlers.
 *
 * When `config.limits` is set, pass `limitsPlugin` (see `CreateAppOptions`) to
 * wire the same storage backend into Better Auth's auth-endpoint rate
 * limiting. The user-level `config.auth.rateLimit.enabled: false` override
 * (used to suppress rate limiting in tests) is always respected and takes
 * priority over the limits-derived configuration.
 *
 * When the limits plugin opens an external connection (e.g. Redis, for the
 * `redis` backend's Better Auth secondaryStorage), that connection is
 * released automatically when `app.stop()` is called, via the plugin's
 * returned `close`.
 */
export async function createApp(options: CreateAppOptions): Promise<HypersonicApp> {
  const { config, env, prisma } = options

  if (!config.database) {
    throw new Error(
      'Hypersonic: config.database is required. ' +
        'Add a database block to your hypersonic.config.ts:\n' +
        '  database: { provider: "yourdbname" }',
    )
  }

  const logger = createLogger(config.logging?.level ?? 'error')

  const app = express()

  // Security headers.
  // - CSP omitted — requires app-specific configuration; see docs.
  // - referrerPolicy: same-origin preserves the Referer header for
  //   same-origin requests so error handlers can redirect back to the
  //   originating form. The Helmet default (no-referrer) strips the header
  //   entirely, breaking Inertia's redirect-on-error behaviour.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  )

  // HTTP request / response logging via pino-http.
  app.use(pinoHttp({ logger }) as unknown as RequestHandler)

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  setPrismaClient(prisma)

  // Resolve Better Auth rate limit config from the injected limits plugin.
  // When `enabled: false` is set (test environments), skip limits wiring
  // so the disabled flag is always honoured.
  let rateLimitOptions: AuthRateLimitOptions | undefined = config.auth.rateLimit
  let secondaryStorage: BetterAuthSecondaryStorage | undefined
  let closeLimitsAuth: (() => Promise<void>) | undefined

  if (config.limits !== undefined && rateLimitOptions?.enabled !== false) {
    const limitsAuth = await resolveLimitsAuthConfig(options)
    rateLimitOptions = limitsAuth.rateLimit
    secondaryStorage = limitsAuth.secondaryStorage
    closeLimitsAuth = limitsAuth.close
  }

  const auth = createAuth({
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: config.auth.trustedOrigins,
    provider: config.database.provider,
    prisma,
    providers: resolveProviders(config, env),
    rateLimit: rateLimitOptions,
    secondaryStorage,
  })
  mountAuth(app, auth)

  await createInertiaMiddleware(app, {
    ssr: config.inertia.ssr,
    version: config.inertia.version,
  })

  const { start, stop } = createLifecycle(app, config, closeLimitsAuth)

  return { express: app, auth, logger, start, stop }
}