import _debug from './debug.mjs'
import isNil from './is-nil.mjs'

const debug = _debug.extend('replacer')

const ref = Symbol('ref')
const call = Symbol('call')
const awaitSymbol = Symbol('await')

/**
 * Create stubs to be used to build the program.
 *
 * @param {string[]} schema - Names of stubs.
 * @param {Function} call - Function to call when awaited.
 *
 * @return {Object} An object containing the named stubs.
 */
export default function api (schema, sendFn) {
  return schema.reduce((api, name) => {
    const fn = (ref, ...args) => {
      const returned = (...args) =>
        fn(() => returned, ...args)

      returned.toJSON = () => ({
        [call]: call,
        ref: ref(),
        args
      })

      returned.then = (resolve) => resolve(send(sendFn, {
        [awaitSymbol]: awaitSymbol,
        ref: returned
      }))

      return returned
    }

    const bound = fn.bind(null, () => bound)

    bound.toJSON = () => ({ [ref]: ref, name })
    bound.then = (resolve) => resolve(send(sendFn, {
      [awaitSymbol]: awaitSymbol,
      ref: bound
    }))

    api[name] = bound

    return api
  }, {})
}

const send = (sendFn, program) => {
  return sendFn(JSON.stringify(program, replacer))
}

const replaced = Symbol('api')

const keywords = [
  'ref',
  'call',
  'quote',
  'await'
]

const isKeyword = v => keywords.includes(v)

function replacer (key, value) {
  debug(key, value)

  if (isNil(value)) {
    return value
  }

  if (value[ref]) {
    const result = ['ref', value.name]

    result[replaced] = replaced

    return result
  }

  if (value[call]) {
    const result = ['call', value.ref, value.args]

    result[replaced] = replaced

    return result
  }

  if (value[awaitSymbol]) {
    const result = ['await', value.ref]

    result[replaced] = replaced

    return result
  }

  // Quote only the reserved string and not the complete array. Quoted values
  // will be unquoted on parse. A quoted quote also.
  if (!value[replaced] && Array.isArray(value)) {
    const [operator, ...rest] = value

    if (isKeyword(operator)) {
      const quoted = ['quote', operator]
      quoted[replaced] = replaced

      return [quoted, ...rest]
    }
  }

  return value
}
