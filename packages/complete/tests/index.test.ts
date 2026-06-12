import { describe, it, expect } from 'vitest'
import * as complete from '../src/index.js'
import * as core from '@hypersonic-js/core'
import * as admin from '@hypersonic-js/admin'

describe('@hypersonic-js/complete re-exports', () => {
  // ── Referential identity ──────────────────────────────────────────────────
  // Guards that complete is a true pass-through — no wrappers, no copies.

  it('re-exported core values are referentially identical to @hypersonic-js/core', () => {
    for (const key of Object.keys(core) as Array<keyof typeof core>) {
      expect(complete[key as keyof typeof complete]).toBe(core[key])
    }
  })

  it('re-exported admin values are referentially identical to @hypersonic-js/admin', () => {
    for (const key of Object.keys(admin) as Array<keyof typeof admin>) {
      expect(complete[key as keyof typeof complete]).toBe(admin[key])
    }
  })

  // ── Config ────────────────────────────────────────────────────────────────

  it('re-exports defineConfig', () => {
    expect(complete.defineConfig).toBeDefined()
    expect(typeof complete.defineConfig).toBe('function')
  })

  it('re-exports loadConfig', () => {
    expect(complete.loadConfig).toBeDefined()
    expect(typeof complete.loadConfig).toBe('function')
  })

  it('re-exports importConfigFile', () => {
    expect(complete.importConfigFile).toBeDefined()
    expect(typeof complete.importConfigFile).toBe('function')
  })

  it('re-exports validateEnv', () => {
    expect(complete.validateEnv).toBeDefined()
    expect(typeof complete.validateEnv).toBe('function')
  })

  it('re-exports buildEnvSchema', () => {
    expect(complete.buildEnvSchema).toBeDefined()
    expect(typeof complete.buildEnvSchema).toBe('function')
  })

  // ── Server ────────────────────────────────────────────────────────────────

  it('re-exports createApp', () => {
    expect(complete.createApp).toBeDefined()
    expect(typeof complete.createApp).toBe('function')
  })

  // ── Database ──────────────────────────────────────────────────────────────

  it('re-exports getPrismaClient', () => {
    expect(complete.getPrismaClient).toBeDefined()
    expect(typeof complete.getPrismaClient).toBe('function')
  })

  it('re-exports setPrismaClient', () => {
    expect(complete.setPrismaClient).toBeDefined()
    expect(typeof complete.setPrismaClient).toBe('function')
  })

  it('re-exports disconnectPrismaClient', () => {
    expect(complete.disconnectPrismaClient).toBeDefined()
    expect(typeof complete.disconnectPrismaClient).toBe('function')
  })

  it('re-exports createDatabaseAdapter', () => {
    expect(complete.createDatabaseAdapter).toBeDefined()
    expect(typeof complete.createDatabaseAdapter).toBe('function')
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('re-exports createAuth', () => {
    expect(complete.createAuth).toBeDefined()
    expect(typeof complete.createAuth).toBe('function')
  })

  it('re-exports mountAuth', () => {
    expect(complete.mountAuth).toBeDefined()
    expect(typeof complete.mountAuth).toBe('function')
  })

  // ── Inertia ───────────────────────────────────────────────────────────────

  it('re-exports createInertiaMiddleware', () => {
    expect(complete.createInertiaMiddleware).toBeDefined()
    expect(typeof complete.createInertiaMiddleware).toBe('function')
  })

  it('re-exports createInertiaErrorHandler', () => {
    expect(complete.createInertiaErrorHandler).toBeDefined()
    expect(typeof complete.createInertiaErrorHandler).toBe('function')
  })

  it('re-exports createViteSetup', () => {
    expect(complete.createViteSetup).toBeDefined()
    expect(typeof complete.createViteSetup).toBe('function')
  })

  // ── Utils — error classes ─────────────────────────────────────────────────

  it('re-exports HttpError as a constructor', () => {
    expect(complete.HttpError).toBeDefined()
    const err = new complete.HttpError(500, 'Internal Server Error')
    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(500)
    expect(err.message).toBe('Internal Server Error')
  })

  it('re-exports NotFoundError extending HttpError', () => {
    expect(complete.NotFoundError).toBeDefined()
    const err = new complete.NotFoundError()
    expect(err).toBeInstanceOf(complete.HttpError)
    expect(err.statusCode).toBe(404)
  })

  it('re-exports UnauthorizedError extending HttpError', () => {
    expect(complete.UnauthorizedError).toBeDefined()
    const err = new complete.UnauthorizedError()
    expect(err).toBeInstanceOf(complete.HttpError)
    expect(err.statusCode).toBe(401)
  })

  it('re-exports ForbiddenError extending HttpError', () => {
    expect(complete.ForbiddenError).toBeDefined()
    const err = new complete.ForbiddenError()
    expect(err).toBeInstanceOf(complete.HttpError)
    expect(err.statusCode).toBe(403)
  })

  it('re-exports ValidationError extending HttpError', () => {
    expect(complete.ValidationError).toBeDefined()
    const err = new complete.ValidationError()
    expect(err).toBeInstanceOf(complete.HttpError)
    expect(err.statusCode).toBe(422)
  })

  // ── Admin ─────────────────────────────────────────────────────────────────

  it('re-exports mountAdmin', () => {
    expect(complete.mountAdmin).toBeDefined()
    expect(typeof complete.mountAdmin).toBe('function')
  })

  it('re-exports scaffoldAdmin', () => {
    expect(complete.scaffoldAdmin).toBeDefined()
    expect(typeof complete.scaffoldAdmin).toBe('function')
  })

  it('re-exports DEFAULT_HIDDEN_MODELS as a non-empty array containing Session', () => {
    expect(Array.isArray(complete.DEFAULT_HIDDEN_MODELS)).toBe(true)
    expect(complete.DEFAULT_HIDDEN_MODELS.length).toBeGreaterThan(0)
    expect(complete.DEFAULT_HIDDEN_MODELS).toContain('Session')
  })

  it('re-exports DEFAULT_PREFIX as /admin', () => {
    expect(complete.DEFAULT_PREFIX).toBe('/admin')
  })

  it('re-exports DEFAULT_PER_PAGE as a positive number', () => {
    expect(typeof complete.DEFAULT_PER_PAGE).toBe('number')
    expect(complete.DEFAULT_PER_PAGE).toBeGreaterThan(0)
  })
})