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
  if (value === undefinedSentinel) return undefined
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
    for (const key of Object.keys(node as object)) {
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
    for (const key of Object.keys(value as object)) {
      result[key] = valueToAST(value[key], leafStringify)
    }
    return result
  }

  return ['leaf', leafStringify(value)]
}

interface InternalNode {
  isUnresolved: boolean
  value?: unknown
  ast: unknown
}

export interface EvaluatorPolicy {
  leafStringify?: LeafStringify
  onUnresolved?: (path: (string | number)[]) => void
  onDone: (value: unknown) => unknown
  onIncomplete?: (ast: unknown) => unknown
}

interface EvaluationContext {
  flatSchema: Record<string, any>
  env: unknown
  leafParse: LeafParse
  policy: EvaluatorPolicy
  awaits?: any[]
  hasUnresolved?: boolean
}

function assertNoEmptyRef (node: unknown): void {
  if (Array.isArray(node)) {
    if (node[0] === 'ref' && node.length === 1) {
      throw new SendScriptReferenceError('Reference path cannot be empty')
    }
    for (const item of node) {
      assertNoEmptyRef(item)
    }
  } else if (isPlainObject(node)) {
    for (const key of Object.keys(node as object)) {
      assertNoEmptyRef((node as any)[key])
    }
  }
}

function unwrapQuoted (node: unknown, leafParse: LeafParse): unknown {
  if (isLeafData(node)) return node.raw
  if (Array.isArray(node)) {
    if (node[0] === 'leaf' && typeof node[1] === 'string') {
      return leafParse(node[1])
    }
    return node.map(item => unwrapQuoted(item, leafParse))
  }
  if (isPlainObject(node)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(node as object)) {
      result[key] = unwrapQuoted((node as any)[key], leafParse)
    }
    return result
  }
  return node
}

function evaluateInternal (
  node: any,
  scope: any,
  ctx: EvaluationContext
): InternalNode {
  if (node === null) {
    return { isUnresolved: false, value: null, ast: null }
  }

  if (node === undefinedSentinel) {
    return { isUnresolved: false, value: undefined, ast: undefined }
  }

  if (isLeafData(node)) {
    return { isUnresolved: false, value: node.raw, ast: node.raw }
  }

  if (Array.isArray(node)) {
    if (node.length === 0) {
      return { isUnresolved: false, value: [], ast: [] }
    }

    const [operator, ...rest] = node

    if (operator === 'leaf') {
      const text = rest[0]
      const raw = ctx.leafParse(text)
      const val = raw === undefined ? undefinedSentinel : raw
      return {
        isUnresolved: false,
        value: val === undefinedSentinel ? undefined : val,
        ast: ['leaf', text]
      }
    }

    if (operator === 'ref') {
      const path = rest
      const res = resolveReference(ctx.flatSchema, ctx.env, path)

      if (!res.found) {
        if (ctx.policy.onUnresolved) {
          try {
            ctx.policy.onUnresolved(path)
          } catch (err: any) {
            if (path.length === 0) {
              err.message = 'Reference path cannot be empty'
            }
            throw err
          }
        }
        ctx.hasUnresolved = true
        return {
          isUnresolved: true,
          ast: ['ref', ...path]
        }
      }

      const val = markHandled(res.value)
      if (typeof val === 'function') {
        return {
          isUnresolved: false,
          value: val,
          ast: ['ref', ...path]
        }
      }

      return {
        isUnresolved: false,
        value: val,
        ast: ctx.policy.leafStringify ? valueToAST(val, ctx.policy.leafStringify) : val
      }
    }

    if (operator === 'call') {
      const [calleeNode, argsNodes = []] = rest
      const calleeRes = evaluateInternal(calleeNode, scope, ctx)
      const argsRes = argsNodes.map((argNode: any) => evaluateInternal(argNode, scope, ctx))

      if (calleeRes.isUnresolved || argsRes.some((a: InternalNode) => a.isUnresolved)) {
        ctx.hasUnresolved = true
        return {
          isUnresolved: true,
          ast: ['call', calleeRes.ast, argsRes.map((a: InternalNode) => a.ast)]
        }
      }

      const fn = calleeRes.value
      if (typeof fn !== 'function') {
        throw new TypeError(`${fn} is not a function`)
      }

      const args = argsRes.map((a: InternalNode) => markHandled(a.value))

      try {
        const result = fn(...args)
        const isProm = result instanceof Promise || (result != null && typeof (result as any).then === 'function')
        return {
          isUnresolved: false,
          value: result,
          ast: typeof result === 'function'
            ? calleeRes.ast
            : isProm
              ? ['call', calleeRes.ast, argsRes.map((a: InternalNode) => a.ast)]
              : (ctx.policy.leafStringify ? valueToAST(result, ctx.policy.leafStringify) : result)
        }
      } catch (err) {
        if (ctx.policy.onIncomplete && err instanceof SendScriptReferenceError) {
          ctx.hasUnresolved = true
          return {
            isUnresolved: true,
            ast: ['call', calleeRes.ast, argsRes.map((a: InternalNode) => a.ast)]
          }
        }
        throw err
      }
    }

    if (operator === 'await') {
      const [index] = rest
      return ctx.awaits![index]
    }

    if (operator === 'then') {
      const [v, onResolve, onReject] = rest
      const targetRes = evaluateInternal(v, scope, ctx)
      const resolveRes = onResolve !== undefined && onResolve !== null ? evaluateInternal(onResolve, scope, ctx) : null
      const rejectRes = onReject !== undefined && onReject !== null ? evaluateInternal(onReject, scope, ctx) : null

      if (
        targetRes.isUnresolved ||
        (resolveRes && resolveRes.isUnresolved) ||
        (rejectRes && rejectRes.isUnresolved)
      ) {
        ctx.hasUnresolved = true
        return {
          isUnresolved: true,
          ast: [
            'then',
            targetRes.ast,
            resolveRes ? resolveRes.ast : null,
            rejectRes ? rejectRes.ast : null
          ]
        }
      }

      const promise = Promise.resolve(targetRes.value)
      const resolveFn = resolveRes ? markHandled(resolveRes.value) : undefined
      const rejectFn = rejectRes ? markHandled(rejectRes.value) : undefined
      const chained = promise.then(resolveFn, rejectFn)

      return {
        isUnresolved: false,
        value: chained,
        ast: targetRes.ast
      }
    }

    if (operator === 'fn') {
      const [argIds = [], bodyNode] = rest
      argIds.forEach((id: string) => assertSafeArgName(id))

      let isUnresolvable = false
      if (ctx.policy.onIncomplete) {
        isUnresolvable = containsUnresolvableRefs(bodyNode, ctx.flatSchema, ctx.env, new Set(argIds))
        if (isUnresolvable) {
          ctx.hasUnresolved = true
        }
      }

      const closure = (...args: unknown[]) => {
        const newScope: any = Object.create(scope)
        argIds.forEach((id: string | number, idx: number) => {
          newScope[id] = markHandled(args[idx])
        })
        const res = evaluateInternal(bodyNode, newScope, ctx)
        if (res.isUnresolved) {
          throw new SendScriptReferenceError('Unresolved reference inside function')
        }
        return res.value
      }

      return {
        isUnresolved: isUnresolvable,
        value: closure,
        ast: ['fn', argIds, bodyNode]
      }
    }

    if (operator === 'arg') {
      const [id] = rest
      assertSafeArgName(id)
      if (scope && Object.hasOwn(scope, id)) {
        const val = scope[id]
        return {
          isUnresolved: false,
          value: val,
          ast: ctx.policy.leafStringify ? valueToAST(val, ctx.policy.leafStringify) : val
        }
      }
      if (ctx.policy.onIncomplete) {
        ctx.hasUnresolved = true
        return {
          isUnresolved: true,
          ast: ['arg', id]
        }
      }
      return {
        isUnresolved: false,
        value: scope ? scope[id] : undefined,
        ast: undefined
      }
    }

    if (operator === 'quote') {
      const [quoted] = rest
      assertNoEmptyRef(quoted)
      const unwrapped = unwrapQuoted(quoted, ctx.leafParse)
      return {
        isUnresolved: false,
        value: unwrapped,
        ast: ['quote', quoted]
      }
    }

    // Plain array
    const itemsRes = node.map((item: any) => {
      const r = evaluateInternal(item, scope, ctx)
      return {
        isUnresolved: r.isUnresolved,
        value: markHandled(r.value),
        ast: r.ast
      }
    })
    if (itemsRes.some((r: InternalNode) => r.isUnresolved)) {
      ctx.hasUnresolved = true
      return {
        isUnresolved: true,
        ast: itemsRes.map((r: InternalNode) => r.ast)
      }
    }
    return {
      isUnresolved: false,
      value: itemsRes.map((r: InternalNode) => r.value),
      ast: itemsRes.map((r: InternalNode) => r.ast)
    }
  }

  if (isPlainObject(node)) {
    const keys = Object.keys(node as object)
    const objRes: Record<string, InternalNode> = {}
    let hasUnres = false
    for (const key of keys) {
      const r = evaluateInternal((node as any)[key], scope, ctx)
      objRes[key] = {
        isUnresolved: r.isUnresolved,
        value: markHandled(r.value),
        ast: r.ast
      }
      if (r.isUnresolved) hasUnres = true
    }
    if (hasUnres) {
      ctx.hasUnresolved = true
      return {
        isUnresolved: true,
        ast: Object.fromEntries(keys.map(k => [k, objRes[k].ast]))
      }
    }
    return {
      isUnresolved: false,
      value: Object.fromEntries(keys.map(k => [k, objRes[k].value])),
      ast: Object.fromEntries(keys.map(k => [k, objRes[k].ast]))
    }
  }

  // Primitive value
  return { isUnresolved: false, value: node, ast: node }
}

/**
 * Creates an evaluator function configured by domain callbacks.
 * Used by Parse and Partial to share all parsing, reviver, awaits and operator evaluation logic.
 */
export function createEvaluator (
  schema: Schema,
  env: unknown,
  leafParse: LeafParse = defaultLeafParse,
  policy: EvaluatorPolicy
): (program: string) => any {
  const flatSchema = flattenSchema(schema)
  const isStrict = !policy.onIncomplete

  return function evaluateProgram (program: string): any {
    const awaits: any[] = []

    const reviver = (key: string, value: any) => {
      if (value === null || !Array.isArray(value)) return value
      const [operator, ...rest] = value

      if (operator === 'leaf') {
        const leafValue = leafParse(rest[0])
        return leafValue === undefined ? undefinedSentinel : leafData(leafValue)
      }

      if (operator === 'await') {
        const [awaitProgram] = rest
        return ['await', awaits.push(awaitProgram) - 1]
      }

      if (operator === 'ref') {
        const path = rest
        const res = resolveReference(flatSchema, env, path)

        if (!res.found) {
          if (policy.onUnresolved) {
            try {
              policy.onUnresolved(path)
            } catch (err: any) {
              if (path.length === 0) {
                err.message = 'Reference path cannot be empty'
              } else {
                err.key = key
                err.value = value
              }
              throw err
            }
          }
          return value
        }

        return markHandled(res.value)
      }

      return value
    }

    const partialReviver = (key: string, value: any) => {
      if (value === null || !Array.isArray(value)) return value
      const [operator, ...rest] = value

      if (operator === 'await') {
        const [awaitProgram] = rest
        return ['await', awaits.push(awaitProgram) - 1]
      }

      return value
    }

    const parsed = typeof program === 'string'
      ? JSON.parse(program, isStrict ? reviver : partialReviver)
      : program

    const ctx: EvaluationContext = {
      flatSchema,
      env,
      leafParse,
      policy,
      awaits
    }

    if (awaits.length) {
      return (async function () {
        for (let i = 0; i < awaits.length; i++) {
          if (policy.onIncomplete) {
            const r = evaluateInternal(awaits[i], {}, ctx)
            if (r.isUnresolved) {
              ctx.hasUnresolved = true
              awaits[i] = { isUnresolved: true, ast: ['await', r.ast] }
            } else {
              try {
                let val = unwrapLeafData(r.value)
                if (val instanceof Promise || (val != null && typeof (val as any).then === 'function')) {
                  val = await val
                }
                awaits[i] = {
                  isUnresolved: false,
                  value: val,
                  ast: typeof val === 'function' ? r.ast : (policy.leafStringify ? valueToAST(val, policy.leafStringify) : val)
                }
              } catch (err) {
                if (err instanceof SendScriptReferenceError) {
                  ctx.hasUnresolved = true
                  awaits[i] = { isUnresolved: true, ast: ['await', r.ast] }
                } else {
                  throw err
                }
              }
            }
          } else {
            const r = evaluateInternal(awaits[i], {}, ctx)
            let val = unwrapLeafData(r.value)
            if (val instanceof Promise || (val != null && typeof (val as any).then === 'function')) {
              val = await val
            }
            awaits[i] = { isUnresolved: false, value: val, ast: val }
          }
        }

        const res = evaluateInternal(parsed, {}, ctx)
        if ((ctx.hasUnresolved || res.isUnresolved) && policy.onIncomplete) {
          return policy.onIncomplete(res.ast)
        }
        return policy.onDone(res.value)
      })()
    }

    const res = evaluateInternal(parsed, {}, ctx)
    if ((ctx.hasUnresolved || res.isUnresolved) && policy.onIncomplete) {
      return policy.onIncomplete(res.ast)
    }
    return policy.onDone(res.value)
  }
}
