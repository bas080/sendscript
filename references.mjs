import { awaitSymbol, call, ref } from './symbol.mjs'

function instrument (path) {
  function reference (...args) {
    const called = instrument(path)

    called.toJSON = () => ({
      [call]: call,
      call: true,
      ref: reference,
      args
    })

    return called
  }

  reference.then = (resolve) => {
    const awaited = instrument(path)
    delete awaited.then

    awaited.toJSON = () => ({
      [awaitSymbol]: awaitSymbol,
      await: true,
      ref: reference
    })

    return resolve(awaited)
  }

  reference.toJSON = () => ({
    [ref]: ref,
    reference: true,
    path
  })

  return reference
}

export default function module (schema, parentPath = []) {
  return schema.reduce((acc, item) => {
    if (typeof item === 'string') {
      // leaf function
      acc[item] = instrument([...parentPath, item])
    } else if (Array.isArray(item)) {
      const [name, children] = item

      if (Array.isArray(children)) {
        // recurse: children can be strings or [name, children] arrays
        acc[name] = module(children, [...parentPath, name])
      } else {
        throw new Error(`Expected children array for namespace "${name}"`)
      }
    } else {
      throw new Error('Schema items must be strings or [name, children] arrays')
    }

    return acc
  }, {})
}
