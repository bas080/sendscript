import { SendScriptReferenceError } from './error.ts'
import type { Schema } from './schema.ts'
import {
  createEvaluator,
  unwrapLeafData,
  defaultLeafParse,
  type LeafParse
} from './evaluator.ts'

export type { LeafParse }
export { defaultLeafParse }

/**
 * Creates a program parser for a given schema and environment.
 *
 * Configured by passing strict policy callbacks to the shared evaluator.
 */
export default function Parse (
  schema: Schema,
  env: unknown,
  leafParse: LeafParse = defaultLeafParse
): (program: string) => unknown {
  return createEvaluator(schema, env, leafParse, {
    onUnresolved: () => {
      throw new SendScriptReferenceError()
    },
    onDone: (value) => unwrapLeafData(value)
  })
}
