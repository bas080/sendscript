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

    const fn = (...args) => {
      const toJSON = () => ['call', fn, ...args]

      return {
        [symbol]: symbol,
        toJSON,
        async then (resolve, reject) {
          return then(await awaitWhenNotStub(toJSON()))(resolve, reject)
        }
      }
    }

    fn.toJSON = () => ['ref', name]
    fn.then = then(fn)
    fn[symbol] = symbol

    api[name] = fn

    return api
  }, {})
}
