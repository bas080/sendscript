import Debug from './debug.mjs'
import isNil from './is-nil.mjs'
import {
  awaitSymbol,
  call,
  ref
} from './symbol.mjs'

const debug = Debug.extend('stringify')

const replaced = Symbol('replaced')
const keywords = ['ref', 'call', 'quote', 'await']
const isKeyword = (v) => keywords.includes(v)
let awaitId = -1

function replacer (key, value) {
  debug(this, key, value)

  if (isNil(value)) {
    return value
  }

  if (value[ref]) {
    const result = ['ref', value.name]

    result[replaced] = replaced

    return result
  }

  if (value[call]) {
    const result = ['call', value.ref, value.args]

    result[replaced] = replaced

    return result
  }

  if (value[awaitSymbol]) {
    awaitId += 1
    const result = ['await', value.ref, awaitId]

    result[replaced] = replaced

    return result
  }

  // Quote only the reserved string and not the complete array. Quoted values
  // will be unquoted on parse. A quoted quote also.
  if (!value[replaced] && Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      const quoted = ['quote', operator]
      quoted[replaced] = replaced

      return [quoted, ...rest]
    }
  }

  return value
}

export default function stringify (program) {
  return JSON.stringify(program, replacer)
}
