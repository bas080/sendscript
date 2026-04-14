import Debug from './debug.mjs'
import { SendScriptSerializationError } from './error.mjs'
import {
  awaitSymbol,
  then,
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

function transformValue (value, leafSerializer) {
  debug(value)

  if (value === null) return null

  // unwrap function wrappers (instrumented nodes)
  if (typeof value === 'function' && typeof value.toJSON === 'function') {
    return transformValue(value.toJSON(), leafSerializer)
  }

  if (value && value[ref]) {
    return ['ref', ...value.path]
  }

  if (value && value[call]) {
    return [
      'call',
      transformValue(value.ref, leafSerializer),
      transformValue(value.args, leafSerializer)
    ]
  }

  if (value && value[awaitSymbol]) {
    return ['await', transformValue(value.ref, leafSerializer)]
  }

  if (value && value[then]) {
    return [
      'then',
      transformValue(value.ref, leafSerializer),
      transformValue(value.resolve || null, leafSerializer),
      transformValue(value.reject || null, leafSerializer)
    ]
  }

  if (Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      return [
        ['quote', operator],
        ...rest.map((item) => transformValue(item, leafSerializer))
      ]
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

  return ['leaf', leafSerializer(value)]
}

/**
 * Default strict serializer for leaf values.
 *
 * Rejects non-JSON-safe values.
 *
 * @param {any} x
 * @returns {string}
 * @public
 */
function defaultLeafStringify (x) {
  const typeOf = typeof x

  if (typeOf === 'object' || typeOf === 'function' || x === undefined) {
    throw new SendScriptSerializationError(
      `Cannot and should not attempt to serialize ${x}`
    )
  }

  return JSON.stringify(x)
}

/**
 * Creates a stringify function for SendScript AST structures.
 *
 * @param {(value: any) => string} [leafSerializer=strictStringify]
 * @returns {(program: any) => string}
 * @public
 */
export default function Stringify (leafStringify = defaultLeafStringify) {
  /**
   * Serializes a program into a JSON string representation.
   *
   * @param {any} program
   * @returns {string}
   * @public
   */
  return function stringify (program) {
    return JSON.stringify(transformValue(program, leafStringify))
  }
}
