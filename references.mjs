import { awaitSymbol, call, ref, then, referenceSymbol } from './symbol.mjs'

/**
 * Creates a callable reference node bound to a path.
 * Used to build a lazy/instrumented execution structure.
 *
 * @param {Array<string>} path - Path representing the function location in schema.
 * @returns {Function} Reference function with attached control methods (.then, .catch, toJSON).
 */
function instrument (path, onAwait = null) {
  /**
   * Creates a callable reference invocation.
   *
   * @param {...any} args - Arguments passed to the call.
   * @returns {Function} New instrumented reference node.
   */
  function reference (...args) {
    const called = instrument(path, onAwait)

    called.toJSON = () => ({
      [call]: call,
      ref: reference,
      args
    })

    return called
  }

  /**
   * Internal helper for building promise-like continuation nodes.
   *
   * @param {Function|null} resolve
   * @param {Function|null} reject
   * @returns {Function} Instrumented continuation node.
   */
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

  /**
   * Registers rejection handler (promise-style).
   *
   * @param {Function} reject
   * @returns {Function}
   */
  reference.catch = (reject) => {
    return dotThen(null, reject)
  }

  /**
   * Handles async chaining or awaiting logic.
   *
   * If resolve/reject contain a reference marker, it behaves like a .then chain.
   * Otherwise it behaves like an await wrapper.
   *
   * @param {Function} resolve
   * @param {Function} reject
   * @returns {Function|any}
   */
  reference.then = (resolve, reject) => {
    if (resolve?.[referenceSymbol] || reject?.[referenceSymbol]) {
      return dotThen(resolve, reject)
    }

    const awaited = instrument(path, onAwait)
    delete awaited.then

    awaited.toJSON = () => ({
      [awaitSymbol]: awaitSymbol,
      ref: reference
    })

    if (typeof onAwait === 'function') {
      return resolve(onAwait(awaited))
    }

    return resolve(awaited)
  }

  /**
   * JSON representation of the reference path node.
   *
   * @returns {{ref: symbol, path: Array<string>}}
   */
  reference.toJSON = () => ({
    [ref]: ref,
    path
  })

  reference[referenceSymbol] = referenceSymbol

  return reference
}

/**
 * Builds a nested API structure from a schema definition.
 *
 * @param {Schema} schema
 * @returns {Object} Nested instrumented API object
 *
 * @throws {Error} If schema format is invalid
 * @public
 */
export default function References (schema, onAwait = null, parentPath = []) {
  return schema.reduce((acc, item) => {
    if (typeof item === 'string') {
      acc[item] = instrument([...parentPath, item], onAwait)
    } else if (Array.isArray(item)) {
      const [name, children] = item

      if (Array.isArray(children)) {
        acc[name] = References(children, onAwait, [...parentPath, name])
      } else {
        throw new Error(`Expected children array for namespace "${name}"`)
      }
    } else {
      throw new Error('Schema items must be strings or [name, children] arrays')
    }

    return acc
  }, {})
}
