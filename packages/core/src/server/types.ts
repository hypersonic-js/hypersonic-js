import type { Application } from 'express'
import type { Logger } from '../logger/index.js'
import type { HypersonicConfig, LimitsConfig } from '../config/types.js'
import type { Env } from '../config/env.js'
import type { PrismaClientLike } from '../database/client.js'
import type { AuthInstance } from '../auth/setup.js'
import type { AuthRateLimitOptions } from '../auth/types.js'

export interface CreateAppOptions {
  config: HypersonicConfig
  env: Env
  prisma: PrismaClientLike
  /**
   * Wires `config.limits` into Better Auth's auth-endpoint rate limiting.
   * Required only when `config.limits` is set (and not disabled via
   * `config.auth.rateLimit.enabled: false`) — pass `buildAuthLimitsConfig`
   * from `@hypersonic-js/limits`:
   *
   * ```ts
   * import { buildAuthLimitsConfig } from '@hypersonic-js/limits'
   * createApp({ config, env, prisma, limitsPlugin: buildAuthLimitsConfig })
   * ```
   */
  limitsPlugin?(
    config: LimitsConfig,
    env: Env,
    prisma?: unknown,
  ): Promise<{
    rateLimit?: AuthRateLimitOptions
    close?: () => Promise<void>
  }>
}

export interface HypersonicApp {
  express: Application
  auth: AuthInstance
  /** Pino logger configured from hypersonic.config.ts — defaults to 'error' level. */
  logger: Logger
  start: () => Promise<void>
  stop: () => Promise<void>
}