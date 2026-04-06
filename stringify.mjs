import Debug from './debug.mjs'
import {
  awaitSymbol,
  call,
  ref
} from './symbol.mjs'

const debug = Debug.extend('stringify')

const keywords = ['ref', 'call', 'quote', 'await']
const isKeyword = (v) => keywords.includes(v)

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function transformValue (value, leafSerializer, state) {
  debug(value)

  if (value === null) {
    return null
  }

  if (typeof value === 'function' && typeof value.toJSON === 'function') {
    return transformValue(value.toJSON(), leafSerializer, state)
  }

  if (value && value[ref]) {
    return ['ref', value.name]
  }

  if (value && value[call]) {
    return ['call', transformValue(value.ref, leafSerializer, state), transformValue(value.args, leafSerializer, state)]
  }

  if (value && value[awaitSymbol]) {
    state.awaitId += 1
    return ['await', transformValue(value.ref, leafSerializer, state), state.awaitId]
  }

  if (Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      return [['quote', operator], ...rest.map((item) => transformValue(item, leafSerializer, state))]
    }

    return value.map((item) => transformValue(item, leafSerializer, state))
  }

  if (isPlainObject(value)) {
    const result = {}

    for (const key of Object.keys(value)) {
      result[key] = transformValue(value[key], leafSerializer, state)
    }

    return result
  }

  return ['leaf', leafSerializer(value)]
}

export default function stringify (program, leafSerializer = JSON.stringify) {
  const state = { awaitId: -1 }
  return JSON.stringify(transformValue(program, leafSerializer, state))
}
