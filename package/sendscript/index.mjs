import stringify from './stringify.mjs'
import makeModule from './module.mjs'
import parse from './parse.mjs'

export default function sendscript (module) {
  return {
    stringify,
    parse: parse(module),
    module: makeModule(module)
  }
}
