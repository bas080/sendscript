import stringify from './stringify.js'
import makeModule from './module.js'
import createParser from './parse.js'

interface SendScriptInstance {
  stringify: (program: any, leafSerializer?: (value: any) => string) => string
  parse: (program: string, leafDeserializer?: ((text: string) => any) | null) => any
  module: Record<string, any>
}

export default function sendscript (env: Record<string, any>): SendScriptInstance {
  return {
    stringify,
    parse: createParser(env),
    module: makeModule(env)
  }
}
