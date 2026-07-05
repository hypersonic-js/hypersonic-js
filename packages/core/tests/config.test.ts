import { describe, it, expect, expectTypeOf } from 'vitest'
import { defineConfig } from '../src/config/define-config.js'
import { buildEnvSchema, validateEnv } from '../src/config/env.js'
import { loadConfig } from '../src/config/loader.js'
import type { HypersonicConfig, LimitsConfig } from '../src/config/types.js'

const baseConfig: HypersonicConfig = {
  server: { port: 3000, host: 'localhost' },
  auth: { trustedOrigins: ['http://localhost:3000'] },
  inertia: { ssr: true },
  database: { provider: 'postgresql' },
}

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
}

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    expect(defineConfig(baseConfig)).toBe(baseConfig)
  })
})

describe('buildEnvSchema', () => {
  it('accepts valid base env with no providers', () => {
    expect(buildEnvSchema(baseConfig).safeParse(baseEnv).success).toBe(true)
  })

  it('requires GITHUB vars when github provider is enabled', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, providers: { github: true } },
    }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(false)
    expect(
      buildEnvSchema(config).safeParse({
        ...baseEnv,
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'sec',
      }).success,
    ).toBe(true)
  })

  it('requires GOOGLE vars when google provider is enabled', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, providers: { google: true } },
    }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(false)
    expect(
      buildEnvSchema(config).safeParse({
        ...baseEnv,
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'sec',
      }).success,
    ).toBe(true)
  })

  it('requires all four OAuth vars when both providers are enabled', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, providers: { github: true, google: true } },
    }
    const schema = buildEnvSchema(config)
    expect(schema.safeParse({ ...baseEnv, GITHUB_CLIENT_ID: 'gid', GITHUB_CLIENT_SECRET: 'gsec' }).success).toBe(false)
    expect(
      schema.safeParse({
        ...baseEnv,
        GITHUB_CLIENT_ID: 'gid',
        GITHUB_CLIENT_SECRET: 'gsec',
        GOOGLE_CLIENT_ID: 'goid',
        GOOGLE_CLIENT_SECRET: 'gosec',
      }).success,
    ).toBe(true)
  })

  it('rejects BETTER_AUTH_SECRET shorter than 32 chars', () => {
    expect(
      buildEnvSchema(baseConfig).safeParse({ ...baseEnv, BETTER_AUTH_SECRET: 'tooshort' }).success,
    ).toBe(false)
  })

  it('rejects empty DATABASE_URL', () => {
    expect(
      buildEnvSchema(baseConfig).safeParse({ ...baseEnv, DATABASE_URL: '' }).success,
    ).toBe(false)
  })

  // ── limits backend — REDIS_URL ───────────────────────────────────────────

  it('does not require REDIS_URL when limits is not configured', () => {
    expect(buildEnvSchema(baseConfig).safeParse(baseEnv).success).toBe(true)
  })

  it('does not require REDIS_URL when limits.backend is memory', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'memory' } }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(true)
  })

  it('does not require REDIS_URL when limits.backend is database', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'database' } }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(true)
  })

  it('requires REDIS_URL when limits.backend is redis', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'redis', window: 10 } }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(false)
  })

  it('requires REDIS_URL when limits.backend is redis and auth.rateLimit.enabled is true', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, rateLimit: { enabled: true } },
      limits: { backend: 'redis', window: 10 },
    }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(false)
  })

  it('does not require REDIS_URL when limits.backend is redis but auth.rateLimit.enabled is false', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, rateLimit: { enabled: false } },
      limits: { backend: 'redis', window: 10 },
    }
    expect(buildEnvSchema(config).safeParse(baseEnv).success).toBe(true)
  })

  it('does not add REDIS_URL to the schema shape when auth.rateLimit.enabled is false', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, rateLimit: { enabled: false } },
      limits: { backend: 'redis', window: 10 },
    }
    expect(buildEnvSchema(config).shape['REDIS_URL']).toBeUndefined()
  })

  it('validateEnv succeeds without REDIS_URL when auth.rateLimit.enabled is false', () => {
    const config: HypersonicConfig = {
      ...baseConfig,
      auth: { ...baseConfig.auth, rateLimit: { enabled: false } },
      limits: { backend: 'redis', window: 10 },
    }
    expect(() => validateEnv(config, baseEnv)).not.toThrow()
  })

  it('accepts a valid REDIS_URL when limits.backend is redis', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'redis', window: 10 } }
    expect(
      buildEnvSchema(config).safeParse({ ...baseEnv, REDIS_URL: 'redis://localhost:6379' }).success,
    ).toBe(true)
  })

  it('rejects an empty REDIS_URL when limits.backend is redis', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'redis', window: 10 } }
    expect(
      buildEnvSchema(config).safeParse({ ...baseEnv, REDIS_URL: '' }).success,
    ).toBe(false)
  })

  it('the error message mentions REDIS_URL when it is missing', () => {
    const config: HypersonicConfig = { ...baseConfig, limits: { backend: 'redis', window: 10 } }
    expect(() => validateEnv(config, baseEnv)).toThrowError(/REDIS_URL/)
  })
})

describe('validateEnv', () => {
  it('returns a typed Env object for valid input', () => {
    const env = validateEnv(baseConfig, baseEnv)
    expect(env.DATABASE_URL).toBe(baseEnv.DATABASE_URL)
    expect(env.BETTER_AUTH_SECRET).toBe(baseEnv.BETTER_AUTH_SECRET)
  })

  it('throws listing all missing variables', () => {
    expect(() => validateEnv(baseConfig, {})).toThrowError(/Environment validation failed/)
  })

  it('includes the missing field name in the error message', () => {
    expect(() =>
      validateEnv(baseConfig, { BETTER_AUTH_SECRET: 'a'.repeat(32) }),
    ).toThrowError(/DATABASE_URL/)
  })
})

describe('loadConfig', () => {
  it('returns config and env when import succeeds and env is valid', async () => {
    const importer = async () => ({ default: baseConfig })
    const result = await loadConfig('/fake', baseEnv, importer)
    expect(result.config).toEqual(baseConfig)
    expect(result.env.DATABASE_URL).toBe(baseEnv.DATABASE_URL)
  })

  it('throws when the config file cannot be imported', async () => {
    const importer = async () => { throw new Error('ENOENT') }
    await expect(loadConfig('/fake', baseEnv, importer)).rejects.toThrowError(
      /Failed to load hypersonic\.config\.ts/,
    )
  })

  it('includes the original error detail in the thrown message', async () => {
    const importer = async () => { throw new Error('syntax error') }
    await expect(loadConfig('/fake', baseEnv, importer)).rejects.toThrowError(/syntax error/)
  })

  it('throws when the default export is missing', async () => {
    const importer = async () => ({})
    await expect(loadConfig('/fake', baseEnv, importer)).rejects.toThrowError(
      /must export a config via defineConfig/,
    )
  })

  it('throws when env is invalid', async () => {
    const importer = async () => ({ default: baseConfig })
    await expect(loadConfig('/fake', {}, importer)).rejects.toThrowError(
      /Environment validation failed/,
    )
  })
})

// ── LoggingConfig / LogLevel ──────────────────────────────────────────────────

describe('HypersonicConfig logging field', () => {
  it('accepts a config with no logging field', () => {
    const config: HypersonicConfig = { ...baseConfig }
    expect(config.logging).toBeUndefined()
  })

  it('accepts logging: { level: "error" }', () => {
    const config: HypersonicConfig = { ...baseConfig, logging: { level: 'error' } }
    expect(config.logging?.level).toBe('error')
  })

  it('accepts logging: { level: "debug" }', () => {
    const config: HypersonicConfig = { ...baseConfig, logging: { level: 'debug' } }
    expect(config.logging?.level).toBe('debug')
  })

  it('accepts logging: { level: "silent" }', () => {
    const config: HypersonicConfig = { ...baseConfig, logging: { level: 'silent' } }
    expect(config.logging?.level).toBe('silent')
  })

  it('defineConfig round-trips the logging field unchanged', () => {
    const config: HypersonicConfig = { ...baseConfig, logging: { level: 'warn' } }
    expect(defineConfig(config).logging?.level).toBe('warn')
  })
})

// ── LimitsConfig discriminated union ────────────────────────────────────────
// Compile-time-only assertions (expectTypeOf performs no runtime check) —
// a regression here surfaces as a TypeScript error on this file, not a
// failing it(). Guards that the redis variant keeps requiring `window` and
// the other two variants keep NOT accepting it, so a future edit can't
// silently widen or narrow the union.

describe('LimitsConfig discriminated union stays exact', () => {
  it('the redis variant has a required window: number', () => {
    expectTypeOf<Extract<LimitsConfig, { backend: 'redis' }>>().toHaveProperty('window')
    expectTypeOf<Extract<LimitsConfig, { backend: 'redis' }>['window']>().toEqualTypeOf<number>()
  })

  it('the memory variant does not have a window property', () => {
    expectTypeOf<Extract<LimitsConfig, { backend: 'memory' }>>().not.toHaveProperty('window')
  })

  it('the database variant does not have a window property', () => {
    expectTypeOf<Extract<LimitsConfig, { backend: 'database' }>>().not.toHaveProperty('window')
  })

  it('a redis config literal without window is rejected at compile time', () => {
    // @ts-expect-error — window is required when backend is 'redis'
    const _missingWindow: LimitsConfig = { backend: 'redis' }
    void _missingWindow
  })
})