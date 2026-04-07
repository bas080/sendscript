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
  if (Array.isArray(schema)) {
    return schema.reduce((acc, name) => {
      acc[name] = instrument([...parentPath, name])
      return acc
    }, {})
  }

  return Object.keys(schema).reduce((acc, key) => {
    const value = schema[key]

    if (Array.isArray(value)) {
      acc[key] = module(value, [...parentPath, key])
    } else if (typeof value === 'object' && value !== null) {
      acc[key] = module(value, [...parentPath, key])
    } else {
      acc[key] = instrument([...parentPath, key])
    }

    return acc
  }, {})
}
