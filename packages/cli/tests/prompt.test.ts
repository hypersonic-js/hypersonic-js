import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock readline for the non-hidden path ───────────────────────────────────

const mockQuestion = vi.fn()
const mockClose = vi.fn()
const mockCreateInterface = vi.fn(() => ({ question: mockQuestion, close: mockClose }))

vi.mock('readline', () => ({
  createInterface: (opts: unknown) => mockCreateInterface(opts),
}))

import { prompt } from '../src/utils/prompt.js'

// ── Shared stdout capture ────────────────────────────────────────────────────

let stdoutOutput = ''
let originalIsTTY: boolean | undefined

beforeEach(() => {
  vi.clearAllMocks()
  stdoutOutput = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutOutput += String(chunk)
    return true
  })
  originalIsTTY = process.stdin.isTTY
})

afterEach(() => {
  vi.restoreAllMocks()
  process.stdin.isTTY = originalIsTTY
  // setRawMode does not exist on this environment's non-TTY stdin socket —
  // remove the ad-hoc stub added by the "hidden prompts" tests below so it
  // doesn't leak into other test files.
  delete (process.stdin as unknown as Record<string, unknown>)['setRawMode']
})

// ── Non-hidden prompts — readline path ──────────────────────────────────────

describe('prompt — non-hidden (readline)', () => {
  it('resolves with the answer from readline', async () => {
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('my answer'))
    const result = await prompt('Enter value: ')
    expect(result).toBe('my answer')
  })

  it('passes process.stdin/process.stdout to createInterface', async () => {
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('x'))
    await prompt('Q?')
    expect(mockCreateInterface).toHaveBeenCalledWith({ input: process.stdin, output: process.stdout })
  })

  it('passes the question text to rl.question', async () => {
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('x'))
    await prompt('What is your name? ')
    expect(mockQuestion).toHaveBeenCalledWith('What is your name? ', expect.any(Function))
  })

  it('closes the readline interface after receiving an answer', async () => {
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('x'))
    await prompt('Q?')
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('uses readline (not raw stdin) when hidden=true but stdin is not a TTY', async () => {
    process.stdin.isTTY = false
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('secret'))
    const result = await prompt('Password: ', true)
    expect(result).toBe('secret')
    expect(mockCreateInterface).toHaveBeenCalledOnce()
  })

  it('uses readline when hidden is omitted (defaults to false)', async () => {
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('default-path'))
    const result = await prompt('Q?')
    expect(result).toBe('default-path')
    expect(mockCreateInterface).toHaveBeenCalledOnce()
  })
})

// ── Hidden prompts — raw stdin path (requires isTTY) ────────────────────────

describe('prompt — hidden (raw stdin, TTY)', () => {
  let dataHandler: ((chunk: Buffer) => void) | undefined
  let removedHandler: ((chunk: Buffer) => void) | undefined
  let setRawModeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.stdin.isTTY = true
    dataHandler = undefined
    removedHandler = undefined

    // setRawMode only exists on a real tty.ReadStream; this test environment's
    // stdin is a plain Socket, so it must be stubbed as an own property rather
    // than spied on with vi.spyOn (which requires the method to already exist).
    setRawModeMock = vi.fn().mockReturnValue(process.stdin)
    ;(process.stdin as unknown as Record<string, unknown>)['setRawMode'] = setRawModeMock

    vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin)
    vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin)
    vi.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin)
    vi.spyOn(process.stdin, 'on').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'data') dataHandler = handler as (chunk: Buffer) => void
        return process.stdin
      },
    )
    vi.spyOn(process.stdin, 'removeListener').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'data') removedHandler = handler as (chunk: Buffer) => void
        return process.stdin
      },
    )
  })

  it('writes the question to stdout immediately', () => {
    void prompt('Password: ', true)
    expect(stdoutOutput).toBe('Password: ')
  })

  it('enables raw mode and resumes stdin with utf8 encoding', () => {
    void prompt('Password: ', true)
    expect(setRawModeMock).toHaveBeenCalledWith(true)
    expect(process.stdin.resume).toHaveBeenCalledOnce()
    expect(process.stdin.setEncoding).toHaveBeenCalledWith('utf8')
  })

  it('accumulates typed characters and resolves on Enter (\\r)', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('s'))
    dataHandler!(Buffer.from('e'))
    dataHandler!(Buffer.from('c'))
    dataHandler!(Buffer.from('\r'))
    await expect(resultPromise).resolves.toBe('sec')
  })

  it('resolves on newline (\\n)', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('a'))
    dataHandler!(Buffer.from('\n'))
    await expect(resultPromise).resolves.toBe('a')
  })

  it('resolves on Ctrl-C', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('a'))
    dataHandler!(Buffer.from('\u0003'))
    await expect(resultPromise).resolves.toBe('a')
  })

  it('removes the last character from the buffer on backspace', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('a'))
    dataHandler!(Buffer.from('b'))
    dataHandler!(Buffer.from('\u007F'))
    dataHandler!(Buffer.from('\r'))
    await expect(resultPromise).resolves.toBe('a')
  })

  it('backspace on an empty buffer does not throw and yields an empty string', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('\u007F'))
    dataHandler!(Buffer.from('\r'))
    await expect(resultPromise).resolves.toBe('')
  })

  it('disables raw mode, pauses stdin, and removes the data listener on completion', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('\r'))
    await resultPromise
    expect(setRawModeMock).toHaveBeenCalledWith(false)
    expect(process.stdin.pause).toHaveBeenCalledOnce()
    expect(removedHandler).toBe(dataHandler)
  })

  it('writes a trailing newline after completion', async () => {
    const resultPromise = prompt('Password: ', true)
    dataHandler!(Buffer.from('\r'))
    await resultPromise
    expect(stdoutOutput).toBe('Password: \n')
  })
})