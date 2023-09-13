const symbol = Symbol('dsl')

// Only await values that are not part of the dsl.
const promiseAllNonDSL = async values => values.reduce(async (_acc, value) => {
  const acc = await _acc

  if (value[symbol] === symbol) {
    acc.push(value)
  } else {
    acc.push(await value)
  }

  return acc
}, [])

export default function dsl (schema, call) {
  return schema.reduce((api, name) => {
    const then = (program) => (resolve, reject) =>
      Promise.resolve(call(program)).then(resolve, reject)

    const fn = (...args) => {
      // Only await non dsl values
      const v = [fn, ...args]

      v[symbol] = symbol
      v.then = async (...thenArgs) => {
        return then(await promiseAllNonDSL(v))(...thenArgs)
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
