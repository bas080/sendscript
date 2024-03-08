import awaitWhen from './await-when.mjs'

const symbol = Symbol('api')
const isNotStub = v => v?.[symbol] !== symbol
const awaitWhenNotStub = awaitWhen(isNotStub)

/**
 * Create stubs to be used to build the program.
 *
 * @param {string[]} schema - Names of stubs.
 * @param {Function} call - Function to call when awaited.
 *
 * @return {Object} An object containing the named stubs.
 */
export default function api (schema, call) {
  return schema.reduce((api, name) => {
    const then = (program) => (resolve, reject) =>
      Promise.resolve(call(program)).then(resolve, reject)

    const fn = (called, ...args) => {
      const toJSON = () => ['call', called, args]

      const fnInner = (...args) =>
        fn(fnInner, ...args)

      return Object.assign(fnInner, {
        [symbol]: symbol,
        toJSON,
        async then (resolve, reject) {
          return then(await awaitWhenNotStub(toJSON()))(resolve, reject)
        }
      })
    }

    fn.toJSON = () => ['ref', name]
    fn.then = then(fn.bind(null, fn))
    fn[symbol] = symbol

    api[name] = fn.bind(null, fn)

    return api
  }, {})
}
