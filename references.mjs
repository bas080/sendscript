import { awaitSymbol, call, ref, then, referenceSymbol } from './symbol.mjs'

function instrument (path) {
  function reference (...args) {
    const called = instrument(path)

    called.toJSON = () => ({
      [call]: call,
      ref: reference,
      args
    })

    return called
  }

  function dotThen (resolve, reject) {
    const node = instrument(path)

    node.toJSON = () => ({
      [then]: then,
      ref: reference,
      resolve,
      reject
    })

    return node
  }

  reference.catch = (reject) => {
    return dotThen(null, reject)
  }

  reference.then = (resolve, reject) => {
    // That is how we know if it is an await or a .then call.
    if (resolve?.[referenceSymbol] || reject?.[referenceSymbol]) {
      return dotThen(resolve, reject)
    }

    const awaited = instrument(path)
    // Prevent infinite recur
    delete awaited.then

    awaited.toJSON = () => ({
      [awaitSymbol]: awaitSymbol,
      ref: reference
    })

    return resolve(awaited)
  }

  reference.toJSON = () => ({
    [ref]: ref,
    path
  })

  reference[referenceSymbol] = referenceSymbol

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
