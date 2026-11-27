import Debug from './debug.ts'
import { SendScriptReferenceError } from './error.ts'
import type { Schema } from './schema.ts'
import {
  flattenSchema,
  assertSafeArgName,
  markHandled,
  isPlainObject,
  undefinedSentinel,
  isLeafData,
  leafData,
  unwrapLeafData,
  resolveReference,
  defaultLeafParse,
  type LeafParse
} from './evaluator.ts'

export type { LeafParse }
export { defaultLeafParse }

const debug = Debug.extend('parse')

const spy = (type: string, fn: (...args: any[]) => any) => (...args: any[]) => {
  const value = fn(...args)
  debug(type, args, ' => ', value)
  return value
}

/**
 * Creates a program parser for a given schema and environment.
 *
 * The parser:
 * - resolves references into runtime functions
 * - deserializes leaf nodes
 * - collects and executes async awaits
 * - evaluates AST-like JSON programs
 */
export default function Parse (
  schema: Schema,
  env: unknown,
  leafParse: LeafParse = defaultLeafParse
): (program: string) => unknown {
  const flatSchema = flattenSchema(schema)

  /**
   * Parses and executes a serialized program.
   *
   * @param program - JSON encoded program
   * @returns The evaluated value, or a Promise of it when the program contains awaits
   */
  return function parse (program: string): any {
    debug('program', program)
    const awaits: any[] = []

    const evaluateOuter = spy('eval', (env: any, value: any): any => {
      const evaluate = evaluateOuter.bind(null, env)

      if (value === undefinedSentinel) return undefined

      if (isLeafData(value)) return value.raw

      if (Array.isArray(value)) {
        const [operator, ...rest] = value

        if (operator === 'await') {
          const [index] = rest
          return awaits[index]
        }

        if (operator === 'then') {
          const [v, onResolve, onReject] = rest
          const promise = evaluate(v)
          const onResolveHandler = markHandled(evaluate(onResolve))
          const onRejectHandler = markHandled(evaluate(onReject))

          return promise.then(onResolveHandler, onRejectHandler)
        }

        if (operator === 'fn') {
          const [argIds, body] = [...rest]

          argIds.forEach((id: string) => {
            assertSafeArgName(id)
          })

          return (...args: unknown[]) => {
            const newEnv: any = Object.create(env)

            argIds.forEach((id: string, index: number) => {
              newEnv[id] = markHandled(args[index])
            })

            return evaluateOuter(newEnv, body)
          }
        }

        if (operator === 'arg') {
          const [id] = rest

          assertSafeArgName(id)

          return env[id]
        }

        if (operator === 'call') {
          let [fn, args] = rest
          fn = evaluate(fn)

          return fn(...args.map((arg: any) => markHandled(evaluate(arg))))
        }

        if (operator === 'quote') {
          const [quoted] = rest
          return unwrapLeafData(quoted)
        }

        for (let i = 0; i < value.length; i++) {
          value[i] = markHandled(evaluate(value[i]))
        }

        return value
      }

      if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
          value[key] = markHandled(evaluate(value[key]))
        }
        return value
      }

      return value
    })

    /**
     * JSON reviver used during parsing.
     * Converts encoded operators into runtime structures.
     */
    const reviver = spy('revive', (key: string, value: any) => {
      if (value === null) return value

      if (!Array.isArray(value)) return value

      const [operator, ...rest] = value

      if (operator === 'leaf') {
        const leafValue = leafParse(rest[0])
        return leafValue === undefined ? undefinedSentinel : leafData(leafValue)
      }

      if (operator === 'await') {
        const [awaitProgram] = rest
        return ['await', awaits.push(awaitProgram) - 1]
      }

      if (operator === 'ref') {
        const path = rest
        const res = resolveReference(flatSchema, env, path)

        if (!res.found) {
          if (res.reason === 'empty') {
            throw new SendScriptReferenceError('Reference path cannot be empty')
          }
          throw new SendScriptReferenceError({ key, value } as any)
        }

        return markHandled(res.value)
      }

      return value
    })

    const parsed = JSON.parse(program, reviver)
    debug('parsed', parsed)

    if (awaits.length) {
      debug('awaits', awaits)

      return (async function () {
        for (let i = 0; i < awaits.length; i++) {
          awaits[i] = await evaluateOuter({}, awaits[i])
        }

        debug('awaits(awaited)', awaits)
        return evaluateOuter({}, parsed)
      })()
    }

    return evaluateOuter({}, parsed)
  }
}
