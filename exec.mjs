import _debug from './debug.mjs'
import curry from './curry.mjs'
import isNil from './is-nil.mjs'

const debug = _debug.extend('reviver')

class SendScriptError extends Error {};
class RefError extends SendScriptError {};

const exec = curry(async (env, expression) => {
  debug('exec', expression)

  return JSON.parse(expression, reviver(env))
})

const reviver = env => async (key, value) => {
  debug(key, await (Array.isArray(await value) ? Promise.all(value) : value))

  if (isNil(value)) return value

  // Await all values for all objects properties
  if (!Array.isArray(value)) {
    if (typeof value !== 'object') return value

    const keys = Object.keys(value)

    return keys.reduce(async (_, key) => {
      value[key] = await value[key]

      return value
    }, value)
  }

  const [operator, ...rest] = await Promise.all(value)

  if (operator === 'await') {
    const [awaited] = rest

    return await awaited
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

    throw new RefError({ key, value })
  }

  return Promise.all(value)
}

export {
  SendScriptError,
  RefError
}

export default exec
