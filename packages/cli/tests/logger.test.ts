import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '../src/utils/logger.js'

// Capture writes to stdout/stderr
let stdoutOutput = ''
let stderrOutput = ''

beforeEach(() => {
  stdoutOutput = ''
  stderrOutput = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutOutput += String(chunk)
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput += String(chunk)
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('info writes to stdout', () => {
    logger.info('hello info')
    expect(stdoutOutput).toContain('hello info')
    expect(stderrOutput).toBe('')
  })

  it('success writes to stdout', () => {
    logger.success('all good')
    expect(stdoutOutput).toContain('all good')
    expect(stderrOutput).toBe('')
  })

  it('warn writes to stdout', () => {
    logger.warn('watch out')
    expect(stdoutOutput).toContain('watch out')
    expect(stderrOutput).toBe('')
  })

  it('error writes to stderr', () => {
    logger.error('something broke')
    expect(stderrOutput).toContain('something broke')
    expect(stdoutOutput).toBe('')
  })

  it('info output includes the message and a newline', () => {
    logger.info('test message')
    expect(stdoutOutput).toMatch(/test message\n$/)
  })

  it('success output includes the message and a newline', () => {
    logger.success('done')
    expect(stdoutOutput).toMatch(/done\n$/)
  })

  it('warn output includes the message and a newline', () => {
    logger.warn('careful')
    expect(stdoutOutput).toMatch(/careful\n$/)
  })

  it('error output includes the message and a newline', () => {
    logger.error('bad')
    expect(stderrOutput).toMatch(/bad\n$/)
  })
})
