import Debug from './debug.mjs'
import { SendScriptReferenceError } from './error.mjs'

function flattenSchema (schema) {
  const obj = {}

  for (const item of schema) {
    if (typeof item === 'string') {
      // leaf function
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

// Recursively resolve awaited values in a parsed tree
const evaluate = (value, awaits = []) => {
  if (value === undefinedSentinel) return undefined

  if (Array.isArray(value)) {
    const [operator, ...rest] = value

    if (operator === 'await') {
      const [index] = rest
      // No need to check index. It is closely tied to the program.
      // if (typeof index !== 'number' || index < 0 || index >= awaitsResolved.length) {
      //   throw new Error(`Invalid await index: ${index}`);
      // }
      return awaits[index]
    }

    if (operator === 'call') {
      // Step 1: evaluate the function itself
      let [fn, args] = rest
      fn = evaluate(fn, awaits)

      // Step 2: evaluate each argument AFTER fn is ready
      for (let i = 0; i < args.length; i++) {
        args[i] = evaluate(args[i], awaits)
      }

      // Step 3: call the function
      return fn(...args)
    }

    if (operator === 'quote') {
      const [quoted] = rest
      return quoted // return as-is without evaluating
    }

    // fallback: evaluate each element
    // re-uses the array again.

    for (let index = 0; index < value.length; index++) {
      const item = value[index]
      value[index] = evaluate(item, awaits)
    }
    return value
  }

  if (isPlainObject(value)) {
    // We muatate the object itself. No need to make a new one.
    for (const key of Object.keys(value)) {
      value[key] = evaluate(value[key], awaits)
    }
    return value
  }

  return value
}

const spy = (fn) => (...args) => {
  const value = fn(...args)
  debug(args, ' => ', value)
  return value
}

const defaultLeafDeserializer = (text) => JSON.parse(text)

export default (schemaArg, env, deserialize = defaultLeafDeserializer) => {
  const schema = flattenSchema(schemaArg)

  return function parse (program) {
    debug('program', program)
    const awaits = []

    // Creates the list of awaits that will resolve in order
    // and also deserializes the leaves.
    const reviver = spy((key, value) => {
      if (value === null) return value

      if (!Array.isArray(value)) {
        return value
      }

      const [operator, ...rest] = value

      if (operator === 'leaf') {
        const leafValue = deserialize(rest[0])
        return leafValue === undefined ? undefinedSentinel : leafValue
      }

      if (operator === 'await') {
        const [program] = rest

        return ['await', awaits.push(program) - 1]
      }

      if (operator === 'ref') {
        const path = rest
        let current = env
        let schemaCurrent = schema

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
        for (let index = 0; index < awaits.length; index++) {
          awaits[index] = await evaluate(awaits[index], awaits)
        }

        debug('awaits(awaited)', awaits)

        return evaluate(parsed, awaits)
      })()
    }

    return evaluate(parsed)
  }
}
