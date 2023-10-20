import promiseOnly from './promise-only.mjs'

const symbol = Symbol('api')
const isNonAPI = v => v?.[symbol] !== symbol
const promiseOnlyNonAPI = promiseOnly(isNonAPI)

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
          return then(await promiseOnlyNonAPI(toJSON()))(resolve, reject)
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
