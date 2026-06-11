import { describe, it, expect } from 'vitest'
import { createLogger } from '../src/logger/index.js'

describe('createLogger', () => {
  it('defaults to error level when no argument is given', () => {
    const logger = createLogger()
    expect(logger.level).toBe('error')
  })

  it('sets trace level', () => {
    expect(createLogger('trace').level).toBe('trace')
  })

  it('sets debug level', () => {
    expect(createLogger('debug').level).toBe('debug')
  })

  it('sets info level', () => {
    expect(createLogger('info').level).toBe('info')
  })

  it('sets warn level', () => {
    expect(createLogger('warn').level).toBe('warn')
  })

  it('sets error level explicitly', () => {
    expect(createLogger('error').level).toBe('error')
  })

  it('sets fatal level', () => {
    expect(createLogger('fatal').level).toBe('fatal')
  })

  it('sets silent level', () => {
    expect(createLogger('silent').level).toBe('silent')
  })

  it('returns an object with an error method', () => {
    expect(typeof createLogger().error).toBe('function')
  })

  it('returns an object with a warn method', () => {
    expect(typeof createLogger().warn).toBe('function')
  })

  it('returns an object with an info method', () => {
    expect(typeof createLogger().info).toBe('function')
  })

  it('returns an object with a debug method', () => {
    expect(typeof createLogger().debug).toBe('function')
  })

  it('returns an object with a trace method', () => {
    expect(typeof createLogger().trace).toBe('function')
  })

  it('each call returns an independent logger instance', () => {
    const a = createLogger('debug')
    const b = createLogger('warn')
    expect(a).not.toBe(b)
    expect(a.level).toBe('debug')
    expect(b.level).toBe('warn')
  })
})