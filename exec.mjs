import _debug from './debug.mjs'
import { BlendExpressionError } from './error.mjs'
import curry from './curry.mjs'

const debug = _debug.extend('lisp')
const debugError = debug.extend('error')
const isFunction = x => typeof x === 'function'
const castFunction = x => isFunction(x) ? x : () => x

const exec = curry(async (env, expression) => {
  debug('exec', expression)

  if (!Array.isArray(expression)) {
    return expression
  }

  const [operator, ...args] = expression

  // Yey, resolved and all and ready to call.
  if (isFunction(operator)) {
    try {
      return await operator.call(env, ...(await Promise.all(args.map(exec(env)))))
    } catch (error) {
      debugError(error)
      throw error
    }
  }

  // Use JSON value when toJSON is implemented.
  // NECESSARY? if (operator?.toJSON) { operator = operator.toJSON() }

  if (operator === 'fn') {
    const [body] = args

    return (fnEnv) => exec(Object.assign(Object.create(env), fnEnv), body)
  }

  if (operator === 'let') {
    const letEnv = Object.create(env)
    const [letBindings, letBody] = args

    await Promise.all(letBindings.map(async ([name, letExpr]) => {
      letEnv[name] = await exec(letEnv, letExpr)
    }))

    return exec(letEnv, letBody)
  }

  if (operator === 'ref') {
    const [name] = args
    return env[name]
  }

  if (Array.isArray(operator)) {
    return exec(env, [await exec(env, operator), ...args])
  }

  // Throw error if operator is not in env.
  if (!(operator in env)) {
    const error = new BlendExpressionError(`Unknown expression: ${operator}`)
    debugError(error)
    throw error
  }

  return exec(env, [castFunction(env[operator]), ...args])
})

export { exec }
export default exec
