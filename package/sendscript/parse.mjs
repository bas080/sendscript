import Debug from './debug.mjs'
import isNil from './is-nil.mjs'
import { SendScriptReferenceError } from './error.mjs'

const debug = Debug.extend('parse')

export default (env) =>
  function parse (program) {
    debug('program', program)

    const awaits = []
    const resolved = {}

    JSON.parse(program, (key, value) => {
      if (!Array.isArray(value)) return value

      const [operator, ...rest] = value

      if (operator === 'await') {
        const [program, awaitId] = rest

        awaits.push(((program, awaitId) => async () => {
          resolved[awaitId] = await JSON.parse(
            JSON.stringify(program),
            reviver
          )
        })(program, awaitId))
      }

      return value
    })

    const spy = fn => (...args) => {
      const value = fn(...args)
      debug(args, ' => ', value)
      return value
    }

    const reviver = spy((key, value) => {
      if (isNil(value)) return value

      if (!Array.isArray(value)) {
        return value
      }

      const [operator, ...rest] = value

      if (operator === 'await') {
        const [, awaitId] = rest
        debug('read awaits', resolved[awaitId], awaitId)

        return resolved[awaitId]
      }

      if (Array.isArray(operator) && operator[0] === 'quote') {
        const [, quoted] = operator

        return [quoted, ...rest]
      }

      if (operator === 'call') {
        const [fn, args] = rest

        return fn(...args)
      }

      if (operator === 'ref') {
        const [name] = rest

        if (Object.hasOwn(env, name)) return env[name]

        throw new SendScriptReferenceError({ key, value })
      }

      return value
    })

    if (awaits.length) {
      return sequential(awaits).then(() => {
        return JSON.parse(program, reviver)
      })
    }

    return JSON.parse(program, reviver)
  }

function sequential (promises) {
  return promises.reduce(
    (acc, curr) => acc.then(results => curr().then(res => [...results, res])),
    Promise.resolve([])
  )
}
