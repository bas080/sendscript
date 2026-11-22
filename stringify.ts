import Debug from './debug.ts'
import { SendScriptSerializationError } from './error.ts'
import {
  awaitSymbol,
  referenceSymbol,
  then,
  call,
  ref
} from './symbol.ts'

const asyncFunction = async function () {}
asyncFunction()
const AsyncFunction = asyncFunction.constructor

const debug = Debug.extend('stringify')

const keywords = ['ref', 'call', 'quote', 'await', 'leaf', 'arg', 'fn']
const argSymbol = Symbol('arg')

const isKeyword = (v: unknown): boolean => keywords.includes(v as string)

const isPlainObject = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Serializer for leaf values. Use a custom serializer such as superjson to
 * support types JSON does not handle natively.
 */
export type LeafStringify = (value: unknown) => string

/**
 * Default strict serializer for leaf values.
 *
 * Rejects non-JSON-safe values.
 */
export const defaultLeafStringify: LeafStringify = (x) => {
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
 */
export default function Stringify (leafStringify: LeafStringify = defaultLeafStringify) {
  /**
   * Serializes a program into a JSON string representation.
   */
  return function stringify (program: unknown): string {
    // Reset the argId
    let argId = 0

    function transformValue (value: any): any {
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

        const args: any[] = []
        const argIds: number[] = []

        for (let i = 0; i < value.length; i++) {
          const arg = argId++
          const placeholder: any = ['arg', arg]

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
            ...rest.map((item: any) => transformValue(item))
          ]
        }

        return value.map((item: any) => transformValue(item))
      }

      if (isPlainObject(value)) {
        const result: Record<string, unknown> = {}

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
