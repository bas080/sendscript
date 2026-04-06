import SendScriptModule from './module.js'
import repl from 'node:repl'

async function sendscriptRepl (send: (program: any) => any, module: Record<string, any>): Promise<repl.REPLServer> {
  Object.assign(globalThis, SendScriptModule(module))

  async function cb (cmd: string, context: any, filename: string, callback: (err: Error | null, result: any) => void): Promise<void> {
    try {
      const result = await send(eval(cmd)) // eslint-disable-line no-eval
      callback(null, result)
    } catch (err) {
      callback(err as Error, undefined)
    }
  }

  return repl.start({
    prompt: '> ',
    eval: cb as any
  })
}

export default sendscriptRepl
