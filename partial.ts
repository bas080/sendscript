import Debug from './debug.ts'
import { SendScriptReferenceError } from './error.ts'
import type { Schema } from './schema.ts'
import {
  defaultLeafStringify,
  type LeafStringify
} from './stringify.ts'
import {
  flattenSchema,
  resolveReference,
  containsUnresolvableRefs,
  assertSafeArgName,
  markHandled,
  isPlainObject,
  unwrapLeafData,
  valueToAST,
  defaultLeafParse,
  type LeafParse
} from './evaluator.ts'

const debug = Debug.extend('partial')

export interface PartialResult {
  done: boolean
  partial: unknown
}

interface EvaluationResult {
  status: 'resolved' | 'unresolved'
  value?: unknown
  ast: unknown
}

/**
 * Creates a partial program evaluator for a given schema and environment.
 *
 * Unlike Parse, Partial preserves unresolved references and continues
 * evaluating independent branches.
 */
export default function Partial (
  schema: Schema,
  env: unknown,
  leafParse: LeafParse = defaultLeafParse,
  leafStringify: LeafStringify = defaultLeafStringify
): (program: string) => Promise<PartialResult> {
  const flatSchema = flattenSchema(schema)

  return async function partial (program: string): Promise<PartialResult> {
    debug('program', program)
    const ast = typeof program === 'string' ? JSON.parse(program) : program
    let hasUnresolved = false

    async function evaluate (node: any, scope: any): Promise<EvaluationResult> {
      if (node === null) {
        return { status: 'resolved', value: null, ast: null }
      }

      if (Array.isArray(node)) {
        if (node.length === 0) {
          return { status: 'resolved', value: [], ast: [] }
        }

        const [operator, ...rest] = node

        if (operator === 'leaf') {
          const text = rest[0]
          const val = leafParse(text)
          return {
            status: 'resolved',
            value: val,
            ast: ['leaf', text]
          }
        }

        if (operator === 'ref') {
          const path = rest
          const res = resolveReference(flatSchema, env, path)
          if (!res.found) {
            hasUnresolved = true
            return {
              status: 'unresolved',
              ast: ['ref', ...path]
            }
          }

          const val = markHandled(res.value)
          if (typeof val === 'function') {
            return {
              status: 'resolved',
              value: val,
              ast: ['ref', ...path]
            }
          }

          return {
            status: 'resolved',
            value: val,
            ast: valueToAST(val, leafStringify)
          }
        }

        if (operator === 'call') {
          const [calleeNode, argsNodes = []] = rest
          const calleeRes = await evaluate(calleeNode, scope)
          const argsRes: EvaluationResult[] = []

          for (const argNode of argsNodes) {
            argsRes.push(await evaluate(argNode, scope))
          }

          if (calleeRes.status === 'unresolved' || argsRes.some(a => a.status === 'unresolved')) {
            hasUnresolved = true
            return {
              status: 'unresolved',
              ast: ['call', calleeRes.ast, argsRes.map(a => a.ast)]
            }
          }

          const fn = calleeRes.value
          if (typeof fn !== 'function') {
            throw new TypeError(`${fn} is not a function`)
          }

          try {
            let result = fn(...argsRes.map(a => markHandled(a.value)))
            if (result instanceof Promise || (result != null && typeof (result as any).then === 'function')) {
              result = await result
            }
            return {
              status: 'resolved',
              value: result,
              ast: typeof result === 'function'
                ? calleeRes.ast
                : valueToAST(result, leafStringify)
            }
          } catch (err) {
            if (err instanceof SendScriptReferenceError) {
              hasUnresolved = true
              return {
                status: 'unresolved',
                ast: ['call', calleeRes.ast, argsRes.map(a => a.ast)]
              }
            }
            throw err
          }
        }

        if (operator === 'await') {
          const [innerNode] = rest
          const innerRes = await evaluate(innerNode, scope)

          if (innerRes.status === 'unresolved') {
            hasUnresolved = true
            return {
              status: 'unresolved',
              ast: ['await', innerRes.ast]
            }
          }

          let val = innerRes.value
          try {
            if (val instanceof Promise || (val != null && typeof (val as any).then === 'function')) {
              val = await val
            }
            return {
              status: 'resolved',
              value: val,
              ast: typeof val === 'function' ? innerRes.ast : valueToAST(val, leafStringify)
            }
          } catch (err) {
            if (err instanceof SendScriptReferenceError) {
              hasUnresolved = true
              return {
                status: 'unresolved',
                ast: ['await', innerRes.ast]
              }
            }
            throw err
          }
        }

        if (operator === 'then') {
          const [targetNode, onResolveNode, onRejectNode] = rest
          const targetRes = await evaluate(targetNode, scope)
          const onResolveRes = onResolveNode !== undefined && onResolveNode !== null
            ? await evaluate(onResolveNode, scope)
            : null
          const onRejectRes = onRejectNode !== undefined && onRejectNode !== null
            ? await evaluate(onRejectNode, scope)
            : null

          if (
            targetRes.status === 'unresolved' ||
            (onResolveRes && onResolveRes.status === 'unresolved') ||
            (onRejectRes && onRejectRes.status === 'unresolved')
          ) {
            hasUnresolved = true
            return {
              status: 'unresolved',
              ast: [
                'then',
                targetRes.ast,
                onResolveRes ? onResolveRes.ast : null,
                onRejectRes ? onRejectRes.ast : null
              ]
            }
          }

          try {
            const resolveFn = onResolveRes ? onResolveRes.value as any : null
            const rejectFn = onRejectRes ? onRejectRes.value as any : null
            let promise = Promise.resolve(targetRes.value)
            let result = await promise.then(
              resolveFn ? markHandled(resolveFn) : undefined,
              rejectFn ? markHandled(rejectFn) : undefined
            )
            return {
              status: 'resolved',
              value: result,
              ast: typeof result === 'function' ? targetRes.ast : valueToAST(result, leafStringify)
            }
          } catch (err) {
            if (err instanceof SendScriptReferenceError) {
              hasUnresolved = true
              return {
                status: 'unresolved',
                ast: [
                  'then',
                  targetRes.ast,
                  onResolveRes ? onResolveRes.ast : null,
                  onRejectRes ? onRejectRes.ast : null
                ]
              }
            }
            throw err
          }
        }

        if (operator === 'fn') {
          const [argIds = [], bodyNode] = rest
          argIds.forEach(assertSafeArgName)

          const isUnresolvable = containsUnresolvableRefs(bodyNode, flatSchema, env, new Set(argIds))
          if (isUnresolvable) {
            hasUnresolved = true
          }

          const closure = (...args: unknown[]) => {
            const newScope = Object.create(scope)
            argIds.forEach((id: string | number, idx: number) => {
              newScope[id] = markHandled(args[idx])
            })
            const ev = evaluate(bodyNode, newScope)
            if (ev instanceof Promise) {
              return ev.then(res => {
                if (res.status === 'unresolved') {
                  throw new SendScriptReferenceError('Unresolved reference inside function')
                }
                return res.value
              })
            }
            if ((ev as any).status === 'unresolved') {
              throw new SendScriptReferenceError('Unresolved reference inside function')
            }
            return (ev as any).value
          }

          return {
            status: isUnresolvable ? 'unresolved' : 'resolved',
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
              status: 'resolved',
              value: val,
              ast: valueToAST(val, leafStringify)
            }
          }
          hasUnresolved = true
          return {
            status: 'unresolved',
            ast: ['arg', id]
          }
        }

        if (operator === 'quote') {
          const [quoted] = rest
          return {
            status: 'resolved',
            value: unwrapLeafData(quoted),
            ast: ['quote', quoted]
          }
        }

        // Plain array
        const itemsRes: EvaluationResult[] = []
        let arrayHasUnresolved = false
        for (const item of node) {
          const res = await evaluate(item, scope)
          itemsRes.push(res)
          if (res.status === 'unresolved') {
            arrayHasUnresolved = true
          }
        }

        if (arrayHasUnresolved) {
          hasUnresolved = true
          return {
            status: 'unresolved',
            ast: itemsRes.map(r => r.ast)
          }
        }

        return {
          status: 'resolved',
          value: itemsRes.map(r => r.value),
          ast: itemsRes.map(r => r.ast)
        }
      }

      if (isPlainObject(node)) {
        const objRes: Record<string, EvaluationResult> = {}
        let objHasUnresolved = false
        for (const key of Object.keys(node)) {
          const res = await evaluate(node[key], scope)
          objRes[key] = res
          if (res.status === 'unresolved') {
            objHasUnresolved = true
          }
        }

        if (objHasUnresolved) {
          hasUnresolved = true
          return {
            status: 'unresolved',
            ast: Object.fromEntries(Object.entries(objRes).map(([k, r]) => [k, r.ast]))
          }
        }

        return {
          status: 'resolved',
          value: Object.fromEntries(Object.entries(objRes).map(([k, r]) => [k, r.value])),
          ast: Object.fromEntries(Object.entries(objRes).map(([k, r]) => [k, r.ast]))
        }
      }

      // Primitive value
      return {
        status: 'resolved',
        value: node,
        ast: node
      }
    }

    const result = await evaluate(ast, {})

    if (hasUnresolved || result.status === 'unresolved') {
      return {
        done: false,
        partial: result.ast
      }
    }

    return {
      done: true,
      partial: unwrapLeafData(result.value)
    }
  }
}
