import Debug from './debug.js'
import { SendScriptReferenceError } from './error.js'

const debug = Debug.extend('parse')

const isThenable = (value: any): value is PromiseLike<any> => (
  value != null && typeof value.then === 'function'
)

const isAwaitPromise = Symbol('sendscript-await')
const undefinedSentinel = Symbol('sendscript-undefined')

const isPlainObject = (value: any): boolean => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const markAwait = (promise: any): any => {
  (promise as any)[isAwaitPromise] = true
  return promise
}

const isExplicitAwait = (value: any): boolean => (
  isThenable(value) && (value as any)[isAwaitPromise] === true
)

// Recursively resolve awaited values in a parsed tree
const resolveAwaitedValues = (value: any): any => {
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
    const result: Record<string, any> = {}
    const promises: Promise<void>[] = []

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

// Restore undefined values that were marked with a sentinel during deserialization
const restoreUndefined = (value: any): any => {
  if (value === undefinedSentinel) return undefined

  if (Array.isArray(value)) {
    return value.map(restoreUndefined)
  }

  if (isPlainObject(value)) {
    const result: Record<string, any> = {}

    for (const key of Object.keys(value)) {
      result[key] = restoreUndefined(value[key])
    }

    return result
  }

  return value
}

const spy = (fn: (key: string, value: any) => any): any => (...args: any[]) => {
  const value = fn.apply(null, args as [string, any])
  debug(args, ' => ', value)
  return value
}

const defaultLeafDeserializer = (text: string): any => JSON.parse(text)

type LeafDeserializer = (text: string) => any

export default function createParser (env: Record<string, any>) {
  return function parse (program: string, leafDeserializer?: LeafDeserializer | null): any {
    const deserialize = leafDeserializer || defaultLeafDeserializer

    debug('program', program)

    const reviver = spy((key: string, value: any) => {
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
        const [name] = rest

        if (Object.hasOwn(env, name)) return env[name]

        throw new SendScriptReferenceError(`Reference not found: ${name}`)
      }

      return value
    })

    const parsed = JSON.parse(program, reviver)
    const result = resolveAwaitedValues(parsed)

    const restored = restoreUndefined(result)
    return isThenable(restored) ? restored : restored
  }
}
