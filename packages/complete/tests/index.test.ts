import { describe, it, expect } from 'vitest'
import * as complete from '../src/index.js'
import * as core from '@hypersonic/core'

describe('@hypersonic/complete re-exports', () => {
  it('exports the same set of named exports as @hypersonic/core', () => {
    const coreKeys = Object.keys(core).sort()
    const completeKeys = Object.keys(complete).sort()
    expect(completeKeys).toEqual(coreKeys)
  })

  it('re-exported values are referentially identical to core exports', () => {
    for (const key of Object.keys(core) as Array<keyof typeof core>) {
      expect(complete[key as keyof typeof complete]).toBe(core[key])
    }
  })

  // Config
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

  // Server
  it('re-exports createApp', () => {
    expect(complete.createApp).toBeDefined()
    expect(typeof complete.createApp).toBe('function')
  })

  // Database
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

  // Auth
  it('re-exports createAuth', () => {
    expect(complete.createAuth).toBeDefined()
    expect(typeof complete.createAuth).toBe('function')
  })

  it('re-exports mountAuth', () => {
    expect(complete.mountAuth).toBeDefined()
    expect(typeof complete.mountAuth).toBe('function')
  })

  // Inertia
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

  // Utils — error classes
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

  it('re-exports detectProvider', () => {
    expect(complete.detectProvider).toBeDefined()
    expect(typeof complete.detectProvider).toBe('function')
  })
})