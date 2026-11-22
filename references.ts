import {
  awaitSymbol,
  call,
  ref,
  then,
  referenceSymbol
} from './symbol.ts'
import type { ReferenceJSON } from './symbol.ts'
import type { Schema } from './schema.ts'

export type OnAwait = ((program: unknown) => unknown) | null

export interface Reference {
  (...args: unknown[]): Reference
  catch: (reject: unknown) => Reference
  then?: (resolve: unknown, reject?: unknown) => unknown
  toJSON: () => ReferenceJSON
  [referenceSymbol]: typeof referenceSymbol
}

/**
 * Creates a callable reference node bound to a path.
 * Used to build a lazy/instrumented execution structure.
 */
function instrument (path: string[], onAwait: OnAwait = null): Reference {
  /**
   * Creates a callable reference invocation.
   */
  function reference (...args: unknown[]): Reference {
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
   */
  function dotThen (resolve: unknown, reject: unknown): Reference {
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
   */
  reference.catch = (reject: unknown): Reference => dotThen(null, reject)

  /**
   * Handles async chaining or awaiting logic.
   *
   * If resolve/reject contain a reference marker, it behaves like a .then chain.
   * Otherwise it behaves like an await wrapper.
   */
  reference.then = (resolve: unknown, reject?: unknown): unknown => {
    if ((resolve as any)?.[referenceSymbol] || (reject as any)?.[referenceSymbol]) {
      return dotThen(resolve, reject)
    }

    const awaited = instrument(path, onAwait)
    delete awaited.then

    awaited.toJSON = () => ({
      [awaitSymbol]: awaitSymbol,
      ref: reference
    })

    if (typeof onAwait === 'function') {
      return (resolve as (program: unknown) => unknown)(onAwait(awaited))
    }

    return (resolve as (program: unknown) => unknown)(awaited)
  }

  /**
   * JSON representation of the reference path node.
   */
  reference.toJSON = (): ReferenceJSON => ({
    [ref]: ref,
    path
  })

  reference[referenceSymbol] = referenceSymbol

  return reference
}

/**
 * Builds a nested API structure from a schema definition.
 *
 * Pass a type argument describing your server module to get typed stubs:
 *
 *   references<typeof myModule>(['add', 'square'])
 *
 * @throws {Error} If schema format is invalid
 */
export default function References<R = Record<string, any>> (
  schema: Schema,
  onAwait: OnAwait = null,
  parentPath: string[] = []
): R {
  const collect = (children: Schema, path: string[]): Record<string, any> =>
    children.reduce<Record<string, any>>((acc, item) => {
      if (typeof item === 'string') {
        acc[item] = instrument([...path, item], onAwait)
      } else if (Array.isArray(item)) {
        const [name, subSchema] = item

        if (!Array.isArray(subSchema)) {
          throw new Error(`Expected children array for namespace "${name}"`)
        }

        acc[name] = collect(subSchema, [...path, name])
      } else {
        throw new Error('Schema items must be strings or [name, children] arrays')
      }

      return acc
    }, {})

  return collect(schema, parentPath) as R
}
