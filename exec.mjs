import _debug from './debug.mjs'
import curry from './curry.mjs'

const debug = _debug.extend('lisp')

class SendScriptError extends Error {};
class RefError extends SendScriptError {};

const exec = curry(async (env, expression) => {
  debug('exec', expression)

  if (!Array.isArray(expression)) {
    return expression
  }

  const [operator, ...args] = expression

  if (operator === 'call') {
    const [fnRef, fnArgs] = args

    const fn = await exec(env, fnRef)
    return fn.apply(env, await exec(env, fnArgs))
  }

  if (operator === 'ref') {
    const [name] = args

    if (!env.hasOwnProperty(name)) {
      throw new RefError(expression)
    }

    return env[name]
  }

  return await Promise.all(expression.map(exec(env)))
})

export {
  SendScriptError,
  RefError
}

export default exec
