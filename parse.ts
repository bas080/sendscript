import Debug from './debug.ts'
import { SendScriptReferenceError } from './error.ts'
import type { Schema } from './schema.ts'

/**
 * Default deserializer for leaf nodes.
 */
export const defaultLeafParse = (text: string): unknown => JSON.parse(text)

function flattenSchema (schema: Schema): Record<string, any> {
  const obj: Record<string, any> = {}

  for (const item of schema) {
    if (typeof item === 'string') {
      obj[item] = true
    } else if (Array.isArray(item)) {
      const [name, children] = item

      if (!Array.isArray(children)) {
        throw new Error(`Expected children array for namespace "${name}"`)
      }

      obj[name] = flattenSchema(children)
    } else {
      throw new Error('Schema items must be strings or [name, children] arrays')
    }
  }

  return obj
}

const debug = Debug.extend('parse')

const undefinedSentinel: unique symbol = Symbol('sendscript-undefined')

const isPlainObject = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

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
  leafParse: (text: string) => unknown = defaultLeafParse
): (program: string) => any {
  const flatSchema = flattenSchema(schema)

  /**
   * Parses and executes a serialized program.
   *
   * @param program - JSON encoded program
   */
  return function parse (program: string): any {
    debug('program', program)
    const awaits: any[] = []

    const evaluateOuter = spy('eval', (env: any, value: any): any => {
      const evaluate = evaluateOuter.bind(null, env)

      if (value === undefinedSentinel) return undefined

      if (Array.isArray(value)) {
        const [operator, ...rest] = value

        if (operator === 'await') {
          const [index] = rest
          return awaits[index]
        }

        if (operator === 'then') {
          const [v, onResolve, onReject] = rest
          return evaluate(v).then(
            evaluate(onResolve),
            evaluate(onReject)
          )
        }

        if (operator === 'fn') {
          const [argIds, body] = [...rest]

          return (...args: unknown[]) => {
            const newEnv: any = Object.create(env)

            argIds.forEach((id: string, index: number) => {
              newEnv[id] = args[index]
            })

            return evaluateOuter(newEnv, body)
          }
        }

        if (operator === 'arg') {
          const [id] = rest

          return env[id]
        }

        if (operator === 'call') {
          let [fn, args] = rest
          fn = evaluate(fn)

          return fn(...args.map(evaluate))
        }

        if (operator === 'quote') {
          const [quoted] = rest
          return quoted
        }

        for (let i = 0; i < value.length; i++) {
          value[i] = evaluate(value[i])
        }

        return value
      }

      if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
          value[key] = evaluate(value[key])
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
        return leafValue === undefined ? undefinedSentinel : leafValue
      }

      if (operator === 'await') {
        const [awaitProgram] = rest
        return ['await', awaits.push(awaitProgram) - 1]
      }

      if (operator === 'ref') {
        const path = rest
        let current: any = env
        let schemaCurrent: any = flatSchema

        for (const segment of path) {
          if (schemaCurrent && Object.hasOwn(schemaCurrent, segment)) {
            current = current[segment]
            schemaCurrent = schemaCurrent[segment]
          } else {
            throw new SendScriptReferenceError({ key, value } as any)
          }
        }

        return current
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
