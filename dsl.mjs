import promiseOnly from './promise-only.mjs'

const symbol = Symbol('dsl')
const isNonDSL = v => v?.[symbol] !== symbol
const promiseOnlyNonDSL = promiseOnly(isNonDSL)

export default function dsl (schema, call) {
  return schema.reduce((api, name) => {
    const then = (program) => (resolve, reject) =>
      Promise.resolve(call(program)).then(resolve, reject)

    const fn = (...args) => {
      // Only await non dsl values
      const v = [fn, ...args]

      v[symbol] = symbol
      v.then = async (...thenArgs) => {
        return then(await promiseOnlyNonDSL(v))(...thenArgs)
      }
      return v
    }

    fn.toJSON = () => ['ref', name]
    fn.then = then(fn)
    fn[symbol] = symbol

    api[name] = fn

    return api
  }, {})
}
