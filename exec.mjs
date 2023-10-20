import _debug from './debug.mjs'
import curry from './curry.mjs'

const debug = _debug.extend('lisp')

const exec = curry(async (env, expression) => {
  debug('exec', expression)

  if (!Array.isArray(expression)) {
    return expression
  }

  const [operator, ...args] = expression

  if (operator === 'call') {
    const [fnName, ...fnArgs] = args

    const fn = await exec(env, fnName)
    return fn.apply(env, await exec(env, fnArgs))
  }

  if (operator === 'ref') {
    const [name] = args

    return env[name]
  }

  return await Promise.all(expression.map(exec(env)))
})

export default exec
