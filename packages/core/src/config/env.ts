import { z } from 'zod'
import type { HypersonicConfig } from './types.js'

const baseShape = {
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
}

/**
 * Builds a Zod schema for environment variables.
 * Required vars are derived from what is enabled in the config —
 * e.g. enabling GitHub OAuth makes GITHUB_CLIENT_ID required.
 */
export function buildEnvSchema(config: HypersonicConfig): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodType> = { ...baseShape }

  if (config.auth.providers?.github === true) {
    shape['GITHUB_CLIENT_ID'] = z
      .string()
      .min(1, 'GITHUB_CLIENT_ID is required when GitHub provider is enabled')
    shape['GITHUB_CLIENT_SECRET'] = z
      .string()
      .min(1, 'GITHUB_CLIENT_SECRET is required when GitHub provider is enabled')
  }

  if (config.auth.providers?.google === true) {
    shape['GOOGLE_CLIENT_ID'] = z
      .string()
      .min(1, 'GOOGLE_CLIENT_ID is required when Google provider is enabled')
    shape['GOOGLE_CLIENT_SECRET'] = z
      .string()
      .min(1, 'GOOGLE_CLIENT_SECRET is required when Google provider is enabled')
  }

  return z.object(shape as z.ZodRawShape)
}

export type Env = {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

/**
 * Validates process.env against the config-derived schema.
 * Throws a descriptive error listing every missing or invalid variable.
 */
export function validateEnv(
  config: HypersonicConfig,
  rawEnv: NodeJS.ProcessEnv = process.env,
): Env {
  const schema = buildEnvSchema(config)
  const result = schema.safeParse(rawEnv)

  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Hypersonic: Environment validation failed:\n${messages}`)
  }

  return result.data as Env
}
