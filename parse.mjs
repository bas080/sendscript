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
      // TODO: Test this
      if (!Array.isArray(children)) {
        throw new Error(`Expected children array for namespace "${name}"`)
      }
      obj[name] = flattenSchema(children)
      // TODO: Test this also
    } else {
      throw new Error('Schema items must be strings or [name, children] arrays')
    }
  }

  return obj
}

const debug = Debug.extend('parse')

const isThenable = (value) => (
  value != null && typeof value.then === 'function'
)

const isAwaitPromise = Symbol('sendscript-await')
const undefinedSentinel = Symbol('sendscript-undefined')

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const markAwait = (promise) => {
  promise[isAwaitPromise] = true
  return promise
}

const isExplicitAwait = (value) => (
  isThenable(value) && value[isAwaitPromise] === true
)

// Recursively resolve awaited values in a parsed tree
const resolveAwaitedValues = (value) => {
  if (value === undefinedSentinel) return undefined

  if (isThenable(value)) {
    return isExplicitAwait(value)
      ? markAwait(value.then(resolveAwaitedValues))
      : value
  }

  if (Array.isArray(value)) {
    let hasAwait = false
    const result = value.map((item) => {
      const resolved = resolveAwaitedValues(item)
      if (isExplicitAwait(resolved)) hasAwait = true
      return resolved
    })

    if (!hasAwait) return result

    const awaited = result.map((item, index) =>
      isExplicitAwait(item)
        ? Promise.resolve(item).then((resolved) => {
          result[index] = resolved
          return resolved
        })
        : item
    )

    return markAwait(Promise.all(awaited).then(() => result))
  }

  if (isPlainObject(value)) {
    const result = {}
    const promises = []

    for (const key of Object.keys(value)) {
      const resolved = resolveAwaitedValues(value[key])
      if (isExplicitAwait(resolved)) {
        promises.push(
          Promise.resolve(resolved).then((resolvedValue) => {
            result[key] = resolvedValue
          })
        )
      } else {
        result[key] = resolved
      }
    }

    if (!promises.length) return result
    return markAwait(Promise.all(promises).then(() => result))
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
        return markAwait(Promise.resolve(program))
      }

      if (Array.isArray(operator) && operator[0] === 'quote') {
        const [, quoted] = operator
        return [quoted, ...rest]
      }

      if (operator === 'call') {
        const [fn, args] = rest
        const resolvedFn = isExplicitAwait(fn) ? Promise.resolve(fn) : fn
        const resolvedArgs = resolveAwaitedValues(args)

        if (isExplicitAwait(resolvedFn) || isExplicitAwait(resolvedArgs)) {
          const promiseFn = isExplicitAwait(resolvedFn)
            ? Promise.resolve(resolvedFn)
            : resolvedFn
          const promiseArgs = isExplicitAwait(resolvedArgs)
            ? Promise.resolve(resolvedArgs)
            : resolvedArgs

          return Promise.all([promiseFn, promiseArgs])
            .then(([resolvedFnValue, resolvedArgsValue]) => resolvedFnValue(...resolvedArgsValue))
        }

        return fn(...resolvedArgs)
      }

      if (operator === 'ref') {
        const path = rest // e.g., ["math","add"]
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
    const result = resolveAwaitedValues(parsed)

    return result
  }
}
