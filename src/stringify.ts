import Debug from './debug.js'
import {
  awaitSymbol,
  call,
  ref
} from './symbol.js'

const debug = Debug.extend('stringify')

const keywords = ['ref', 'call', 'quote', 'await', 'leaf']
const isKeyword = (v: string): boolean => keywords.includes(v)

const isPlainObject = (value: any): boolean => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

interface State {
  awaitId: number
}

// Recursively transform a program tree, encoding SendScript operators and leaf values
function transformValue (value: any, leafSerializer: (value: any) => string, state: State): any {
  debug(value)

  if (value === null) {
    return null
  }

  // Normalize SendScript wrapper functions (ref, call, await)
  if (typeof value === 'function' && typeof value.toJSON === 'function') {
    return transformValue(value.toJSON(), leafSerializer, state)
  }

  // Encode SendScript operators
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

  // Handle arrays: quote keyword operators, transform other arrays recursively
  if (Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      // Quote reserved keyword strings to preserve them as data
      return [['quote', operator], ...rest.map((item) => transformValue(item, leafSerializer, state))]
    }

    return value.map((item) => transformValue(item, leafSerializer, state))
  }

  // Recurse into plain objects
  if (isPlainObject(value)) {
    const result: Record<string, any> = {}

    for (const key of Object.keys(value)) {
      result[key] = transformValue(value[key], leafSerializer, state)
    }

    return result
  }

  // Encode non-JSON leaf values (Date, RegExp, BigInt, etc.)
  return ['leaf', leafSerializer(value)]
}

export default function stringify (program: any, leafSerializer: (value: any) => string = JSON.stringify): string {
  const state: State = { awaitId: -1 }
  return JSON.stringify(transformValue(program, leafSerializer, state))
}
