import instrument from './module.mjs'
import repl from 'node:repl'

export default async function sendscriptRepl (send, module) {
  Object.assign(global, instrument(module))

  async function cb (cmd, context, filename, callback) {
    callback(null, await send(eval(cmd))) // eslint-disable-line no-eval
  }

  return repl.start({
    prompt: '> ',
    eval: cb
  })
}
