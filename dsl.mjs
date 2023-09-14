import promiseOnly from './promise-only.mjs'

const symbol = Symbol('dsl')
const isNonDSL = v => v?.[symbol] !== symbol
const promiseOnlyNonDSL = promiseOnly(isNonDSL)

export default function dsl (schema, call) {
  return schema.reduce((api, name) => {
    const then = (program) => (resolve, reject) =>
      Promise.resolve(call(program)).then(resolve, reject)

    const fn = (...args) => ({
      [symbol]: symbol,
      toJSON () {
        return [fn, ...args]
      },
      async then (resolve, reject) {
        return then(await promiseOnlyNonDSL([
          fn, ...args
        ]))(resolve, reject)
      }
    })

    fn.toJSON = () => ['ref', name]
    fn.then = then(fn)
    fn[symbol] = symbol

    api[name] = fn

    return api
  }, {})
}
