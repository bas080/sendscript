import references from './references.ts'
import repl from 'node:repl'

export default async function sendscriptRepl (
  send: (program: unknown) => unknown,
  module: Record<string, unknown>
) {
  Object.assign(globalThis, references(Object.keys(module)))

  async function cb (
    cmd: string,
    context: unknown,
    filename: string,
    callback: (err: Error | null, result?: unknown) => void
  ) {
    callback(null, await send(eval(cmd))) // eslint-disable-line no-eval
  }

  return repl.start({
    prompt: '> ',
    eval: cb
  })
}
