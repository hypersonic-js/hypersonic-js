import { createInterface } from 'readline'

/**
 * Function signature for asking the user a single question.
 * `hidden` suppresses echo, suitable for passwords.
 */
export type PromptFn = (question: string, hidden?: boolean) => Promise<string>

/**
 * Asks the user a question via stdin/stdout.
 *
 * When `hidden` is true the typed characters are not echoed — use this for
 * passwords. Requires stdin to be a TTY; if it isn't (e.g. in a pipe) the
 * input is still read but cannot be hidden.
 */
export async function prompt(question: string, hidden = false): Promise<string> {
  if (hidden && process.stdin.isTTY) {
    return promptHidden(question)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function promptHidden(question: string): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(question)

    let value = ''

    const onData = (chunk: Buffer): void => {
      const char = chunk.toString('utf8')

      if (char === '\r' || char === '\n' || char === '\u0003' /* Ctrl-C */) {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      } else if (char === '\u007F' /* backspace */) {
        value = value.slice(0, -1)
      } else {
        value += char
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', onData)
  })
}