import type { Schema } from './schema.ts'
import { defaultLeafStringify, type LeafStringify } from './stringify.ts'
import {
  createEvaluator,
  unwrapLeafData,
  defaultLeafParse,
  type LeafParse
} from './evaluator.ts'

export interface PartialResult {
  done: boolean
  partial: unknown
}

/**
 * Creates a partial program evaluator for a given schema and environment.
 *
 * Configured by passing partial policy callbacks to the shared evaluator.
 */
export default function Partial (
  schema: Schema,
  env: unknown,
  leafParse: LeafParse = defaultLeafParse,
  leafStringify: LeafStringify = defaultLeafStringify
): (program: string) => any {
  return createEvaluator(schema, env, leafParse, {
    leafStringify,
    onDone: (value) => ({
      done: true,
      partial: unwrapLeafData(value)
    }),
    onIncomplete: (ast) => ({
      done: false,
      partial: ast
    })
  })
}
