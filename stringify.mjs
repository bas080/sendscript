import Debug from './debug.mjs'
import {
  awaitSymbol,
  call,
  ref
} from './symbol.mjs'

const debug = Debug.extend('stringify')

const keywords = ['ref', 'call', 'quote', 'await', 'leaf']
const isKeyword = (v) => keywords.includes(v)

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Recursively transform a program tree, encoding SendScript operators and leaf values
function transformValue (value, leafSerializer) {
  debug(value)

  if (value === null) {
    return null
  }

  // Normalize SendScript wrapper functions (ref, call, await)
  if (typeof value === 'function' && typeof value.toJSON === 'function') {
    return transformValue(value.toJSON(), leafSerializer)
  }

  // Encode SendScript operators
  if (value && value[ref]) {
    return ['ref', ...value.path]
  }

  if (value && value[call]) {
    return ['call', transformValue(value.ref, leafSerializer), transformValue(value.args, leafSerializer)]
  }

  if (value && value[awaitSymbol]) {
    return ['await', transformValue(value.ref, leafSerializer)]
  }

  // Handle arrays: quote keyword operators, transform other arrays recursively
  if (Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      // Quote reserved keyword strings to preserve them as data
      return [['quote', operator], ...rest.map((item) => transformValue(item, leafSerializer))]
    }

    return value.map((item) => transformValue(item, leafSerializer))
  }

  // Recurse into plain objects
  if (isPlainObject(value)) {
    const result = {}

    for (const key of Object.keys(value)) {
      result[key] = transformValue(value[key], leafSerializer)
    }

    return result
  }

  // Encode non-JSON leaf values (Date, RegExp, BigInt, etc.)
  return ['leaf', leafSerializer(value)]
}

export default function stringify (leafSerializer = JSON.stringify) {
  function stringify (program) {
    return JSON.stringify(transformValue(program, leafSerializer))
  }

  return stringify
}
