import Debug from './debug.mjs'
import { SendScriptSerializationError } from './error.mjs'
import {
  awaitSymbol,
  referenceSymbol,
  then,
  call,
  ref
} from './symbol.mjs'

const asyncFunction = async function () {}
asyncFunction()
const AsyncFunction = (asyncFunction).constructor

const debug = Debug.extend('stringify')

const keywords = ['ref', 'call', 'quote', 'await', 'leaf', 'arg', 'fn']
const argSymbol = Symbol('arg')

const isKeyword = (v) => keywords.includes(v)

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
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
 * @returns {stringify}
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
    // Reset the argId
    let argId = 0

    function transformValue (value) {
      debug(value)

      if (value === null) return null

      // unwrap function wrappers (instrumented nodes)
      if (value && value[referenceSymbol]) {
        return transformValue(value.toJSON())
      }

      // Is a simple function. We call it to get the template.
      if (typeof value === 'function') {
        if (value instanceof AsyncFunction) {
          throw new SendScriptSerializationError('Sendscript does not support async functions as of yet.')
        }

        const args = []
        const argIds = []

        for (let i = 0; i < value.length; i++) {
          const arg = argId++
          const placeholder = ['arg', arg]

          placeholder[argSymbol] = argSymbol

          args.push(placeholder)
          argIds.push(arg)
        }

        return ['fn', argIds, transformValue(value(...args))]
      }

      if (value && value[argSymbol]) {
        return value
      }

      if (value && value[ref]) {
        return ['ref', ...value.path]
      }

      if (value && value[call]) {
        return [
          'call',
          transformValue(value.ref),
          transformValue(value.args)
        ]
      }

      if (value && value[awaitSymbol]) {
        return ['await', transformValue(value.ref)]
      }

      if (value && value[then]) {
        return [
          'then',
          transformValue(value.ref),
          transformValue(value.resolve || null),
          transformValue(value.reject || null)
        ]
      }

      if (Array.isArray(value)) {
        const [operator, ...rest] = value

        if (isKeyword(operator)) {
          return [
            ['quote', operator],
            ...rest.map((item) => transformValue(item))
          ]
        }

        return value.map((item) => transformValue(item))
      }

      if (isPlainObject(value)) {
        const result = {}

        for (const key of Object.keys(value)) {
          result[key] = transformValue(value[key])
        }

        return result
      }

      return ['leaf', leafStringify(value)]
    }

    return JSON.stringify(transformValue(program))
  }
}
