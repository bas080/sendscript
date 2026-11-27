import { SendScriptReferenceError } from './error.ts'
import type { Schema } from './schema.ts'
import type { LeafStringify } from './stringify.ts'

/**
 * Deserializer for leaf nodes. Converts serialized leaf text back into a
 * runtime value.
 */
export type LeafParse = (text: string) => unknown

/**
 * Default deserializer for leaf nodes.
 */
export const defaultLeafParse: LeafParse = (text) => JSON.parse(text)

export const undefinedSentinel: unique symbol = Symbol('sendscript-undefined')
export const leafSentinel: unique symbol = Symbol('sendscript-leaf-data')

export interface LeafData {
  [leafSentinel]: true
  raw: unknown
}

export const leafData = (raw: unknown): LeafData => ({ [leafSentinel]: true, raw })

export const isLeafData = (value: unknown): value is LeafData =>
  value !== null && typeof value === 'object' &&
  (value as LeafData)[leafSentinel] === true

export const unwrapLeafData = (value: any): any => {
  if (isLeafData(value)) return value.raw

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = unwrapLeafData(value[i])
    }
    return value
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      value[key] = unwrapLeafData(value[key])
    }
    return value
  }

  return value
}

export const isPlainObject = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export const assertSafeArgName = (id: string | number): void => {
  if (id === '__proto__') {
    throw new Error('"__proto__" is a reserved arg name')
  }
}

export const markHandled = (value: any): any => {
  if (value instanceof Promise || (
    value !== null && typeof value === 'object' && typeof (value as any).catch === 'function'
  )) {
    Promise.resolve(value).catch(() => {})
  }
  return value
}

export function flattenSchema (schema: Schema): Record<string, any> {
  const obj: Record<string, any> = {}

  for (const item of schema) {
    if (typeof item === 'string') {
      obj[item] = true
    } else if (Array.isArray(item)) {
      const [name, children] = item

      if (!Array.isArray(children)) {
        throw new Error(`Expected children array for namespace "${name}"`)
      }

      obj[name] = flattenSchema(children)
    } else {
      throw new Error('Schema items must be strings or [name, children] arrays')
    }
  }

  return obj
}

export interface ResolveReferenceResult {
  found: boolean
  value?: unknown
  reason?: 'empty' | 'schema' | 'env'
}

export function resolveReference (
  flatSchema: Record<string, any>,
  env: unknown,
  path: (string | number)[]
): ResolveReferenceResult {
  if (path.length === 0) return { found: false, reason: 'empty' }

  let current: any = env
  let schemaCurrent: any = flatSchema

  for (const segment of path) {
    if (schemaCurrent && Object.hasOwn(schemaCurrent, segment)) {
      schemaCurrent = schemaCurrent[segment]
      if (
        current !== null &&
        current !== undefined &&
        (typeof current === 'object' || typeof current === 'function') &&
        (segment in current)
      ) {
        current = current[segment]
      } else {
        return { found: false, reason: 'env' }
      }
    } else {
      return { found: false, reason: 'schema' }
    }
  }

  return { found: true, value: current }
}

export function containsUnresolvableRefs (
  node: unknown,
  flatSchema: Record<string, any>,
  env: unknown,
  boundArgs: Set<string | number> = new Set()
): boolean {
  if (node === null || typeof node !== 'object') return false

  if (Array.isArray(node)) {
    if (node.length === 0) return false
    const [operator, ...rest] = node

    if (operator === 'ref') {
      const res = resolveReference(flatSchema, env, rest)
      return !res.found
    }

    if (operator === 'arg') {
      const [id] = rest
      return !boundArgs.has(id)
    }

    if (operator === 'fn') {
      const [argIds, body] = rest
      const newBound = new Set(boundArgs)
      if (Array.isArray(argIds)) {
        for (const id of argIds) newBound.add(id)
      }
      return containsUnresolvableRefs(body, flatSchema, env, newBound)
    }

    if (operator === 'quote' || operator === 'leaf') {
      return false
    }

    for (const item of node) {
      if (containsUnresolvableRefs(item, flatSchema, env, boundArgs)) {
        return true
      }
    }
    return false
  }

  if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      if (containsUnresolvableRefs((node as any)[key], flatSchema, env, boundArgs)) {
        return true
      }
    }
    return false
  }

  return false
}

export function valueToAST (value: any, leafStringify: LeafStringify): any {
  if (isLeafData(value)) {
    return ['leaf', leafStringify(value.raw)]
  }

  if (value === null) return null

  if (Array.isArray(value)) {
    return value.map(item => valueToAST(item, leafStringify))
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      result[key] = valueToAST(value[key], leafStringify)
    }
    return result
  }

  return ['leaf', leafStringify(value)]
}
