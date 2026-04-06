import Debug from './debug.mjs'
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

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function transformValue (value, leafSerializer) {
  debug(value)

  if (value === null) {
    return null
  }

  if (typeof value === 'function' && typeof value.toJSON === 'function') {
    return transformValue(value.toJSON(), leafSerializer)
  }

  if (value && value[ref]) {
    const result = ['ref', value.name]
    result[replaced] = replaced
    return result
  }

  if (value && value[call]) {
    const result = ['call', transformValue(value.ref, leafSerializer), transformValue(value.args, leafSerializer)]
    result[replaced] = replaced
    return result
  }

  if (value && value[awaitSymbol]) {
    awaitId += 1
    const result = ['await', transformValue(value.ref, leafSerializer), awaitId]
    result[replaced] = replaced
    return result
  }

  if (Array.isArray(value)) {
    if (!value[replaced]) {
      const [operator, ...rest] = value

      if (isKeyword(operator)) {
        const quoted = ['quote', operator]
        quoted[replaced] = replaced
        return [quoted, ...rest.map((item) => transformValue(item, leafSerializer))]
      }
    }

    return value.map((item) => transformValue(item, leafSerializer))
  }

  if (isPlainObject(value)) {
    const result = {}

    for (const key of Object.keys(value)) {
      result[key] = transformValue(value[key], leafSerializer)
    }

    return result
  }

  const result = ['leaf', leafSerializer(value)]
  result[replaced] = replaced
  return result
}

export default function stringify (program, leafSerializer = JSON.stringify) {
  return JSON.stringify(transformValue(program, leafSerializer))
}
