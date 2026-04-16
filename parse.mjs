import Debug from './debug.mjs'
import { SendScriptReferenceError } from './error.mjs'

function flattenSchema (schema) {
  const obj = {}

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

const undefinedSentinel = Symbol('sendscript-undefined')

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const spy = (type, fn) => (...args) => {
  const value = fn(...args)
  debug(type, args, ' => ', value)
  return value
}

/**
 * Default deserializer for leaf nodes.
 *
 * @param {string} text
 * @returns {any}
 * @public
 */
const defaultLeafParse = (text) => JSON.parse(text)

/**
 * @template Env
 *
 * Creates a program parser for a given schema and environment.
 *
 * The parser:
 * - resolves references into runtime functions
 * - deserializes leaf nodes
 * - collects and executes async awaits
 * - evaluates AST-like JSON programs
 *
 * @param {Schema}  schema
 * @param {Env} env - runtime environment for refs
 * @param {(text: string) => any} [leafParse=defaultLeafParse]
 * @returns {parse}
 * @public
 */
export default function Parse (schema, env, leafParse = defaultLeafParse) {
  const flatSchema = flattenSchema(schema)

  /**
   * Parses and executes a serialized program.
   *
   * @param {string} program - JSON encoded program
   * @returns {any|Promise<any>}
   * @public
   */
  return function parse (program) {
    debug('program', program)
    const awaits = []

    const evaluateOuter = spy('eval', (env, value) => {
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

          return (...args) => {
            const newEnv = Object.create(env)

            argIds.forEach((id, index) => {
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
     *
     * @param {string} key
     * @param {any} value
     * @returns {any}
     */
    const reviver = spy('revive', (key, value) => {
      if (value === null) return value

      if (!Array.isArray(value)) return value

      const [operator, ...rest] = value

      if (operator === 'leaf') {
        const leafValue = leafParse(rest[0])
        return leafValue === undefined ? undefinedSentinel : leafValue
      }

      if (operator === 'await') {
        const [program] = rest
        return ['await', awaits.push(program) - 1]
      }

      if (operator === 'ref') {
        const path = rest
        let current = env
        let schemaCurrent = flatSchema

        for (const segment of path) {
          if (schemaCurrent && Object.hasOwn(schemaCurrent, segment)) {
            current = current[segment]
            schemaCurrent = schemaCurrent[segment]
          } else {
            throw new SendScriptReferenceError({ key, value })
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
