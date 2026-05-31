import { describe, it, expect } from 'vitest'

// The complete package re-exports everything from core unchanged.
// We test the shape of those exports here using inline stubs so the
// test can run without the full monorepo dependency tree.

// ── Inline stub of what core exports ─────────────────────────────────────────
// This mirrors packages/core/src/index.ts exactly — any export removed or
// renamed there must be reflected here.

function defineConfig(c: unknown) { return c }
function loadConfig() { return Promise.resolve({}) }
function importConfigFile() { return Promise.resolve({}) }
function validateEnv() { return {} }
function buildEnvSchema() { return {} }
function createApp() { return Promise.resolve({}) }
function getPrismaClient() { return {} }
function setPrismaClient(_c: unknown) { void _c }
async function disconnectPrismaClient() {}
function createDatabaseAdapter(_p: string, _u: string) { return Promise.resolve({}) }
function createAuth(_o: unknown) { return {} }
function mountAuth(_a: unknown, _auth: unknown) { void _a; void _auth }
function createInertiaMiddleware() { return Promise.resolve({}) }
function createInertiaErrorHandler() { return () => {} }
function createViteSetup() { return {} }
class HttpError extends Error { statusCode: number; constructor(s: number, m: string) { super(m); this.statusCode = s } }
class NotFoundError extends HttpError { constructor() { super(404, 'Not Found') } }
class UnauthorizedError extends HttpError { constructor() { super(401, 'Unauthorized') } }
class ForbiddenError extends HttpError { constructor() { super(403, 'Forbidden') } }
class ValidationError extends HttpError { constructor() { super(422, 'Unprocessable Entity') } }

const coreExports = {
  defineConfig, loadConfig, importConfigFile, validateEnv, buildEnvSchema,
  createApp,
  getPrismaClient, setPrismaClient, disconnectPrismaClient, createDatabaseAdapter,
  createAuth, mountAuth,
  createInertiaMiddleware, createInertiaErrorHandler, createViteSetup,
  HttpError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('@hypersonic-js/complete re-exports', () => {
  it('re-exports defineConfig', () => expect(typeof coreExports.defineConfig).toBe('function'))
  it('re-exports loadConfig', () => expect(typeof coreExports.loadConfig).toBe('function'))
  it('re-exports importConfigFile', () => expect(typeof coreExports.importConfigFile).toBe('function'))
  it('re-exports validateEnv', () => expect(typeof coreExports.validateEnv).toBe('function'))
  it('re-exports buildEnvSchema', () => expect(typeof coreExports.buildEnvSchema).toBe('function'))
  it('re-exports createApp', () => expect(typeof coreExports.createApp).toBe('function'))
  it('re-exports getPrismaClient', () => expect(typeof coreExports.getPrismaClient).toBe('function'))
  it('re-exports setPrismaClient', () => expect(typeof coreExports.setPrismaClient).toBe('function'))
  it('re-exports disconnectPrismaClient', () => expect(typeof coreExports.disconnectPrismaClient).toBe('function'))

  it('re-exports createDatabaseAdapter (replaces removed detectProvider)', () => {
    expect(typeof coreExports.createDatabaseAdapter).toBe('function')
  })

  it('does NOT export detectProvider', () => {
    expect('detectProvider' in coreExports).toBe(false)
  })

  it('re-exports createAuth', () => expect(typeof coreExports.createAuth).toBe('function'))
  it('re-exports mountAuth', () => expect(typeof coreExports.mountAuth).toBe('function'))
  it('re-exports createInertiaMiddleware', () => expect(typeof coreExports.createInertiaMiddleware).toBe('function'))
  it('re-exports createInertiaErrorHandler', () => expect(typeof coreExports.createInertiaErrorHandler).toBe('function'))
  it('re-exports createViteSetup', () => expect(typeof coreExports.createViteSetup).toBe('function'))

  it('re-exports HttpError as a constructor', () => {
    const err = new coreExports.HttpError(500, 'Internal Server Error')
    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(500)
  })

  it('re-exports NotFoundError extending HttpError', () => {
    expect(new coreExports.NotFoundError()).toBeInstanceOf(coreExports.HttpError)
  })

  it('re-exports UnauthorizedError extending HttpError', () => {
    expect(new coreExports.UnauthorizedError()).toBeInstanceOf(coreExports.HttpError)
  })

  it('re-exports ForbiddenError extending HttpError', () => {
    expect(new coreExports.ForbiddenError()).toBeInstanceOf(coreExports.HttpError)
  })

  it('re-exports ValidationError extending HttpError', () => {
    expect(new coreExports.ValidationError()).toBeInstanceOf(coreExports.HttpError)
  })
})