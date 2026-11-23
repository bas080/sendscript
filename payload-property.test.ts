import { test } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import Parse from './parse.ts'
import type { Schema } from './schema.ts'

const env = {
  add: (a: number, b: number) => a + b,
  resolve: (x: unknown) => Promise.resolve(x),
  reject: (x: unknown) => Promise.reject(x),
  noop: () => 'ok',
  data: { x: 1 }
}

const schema: Schema = ['add', 'resolve', 'reject', 'noop', ['data', []]]

let unhandledHit = false
let unhandledReason: unknown

process.on('unhandledRejection', reason => {
  unhandledHit = true
  unhandledReason = reason
})

const scalar = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string({ maxLength: 8 })
)

const jsonLeaf: fc.Arbitrary<unknown> = fc.oneof(scalar, fc.array(scalar, { maxLength: 2 }))

const refSegments = fc.array(
  fc.oneof(
    fc.constantFrom('add', 'reject', 'resolve', 'noop', 'data'),
    fc.constantFrom('zz', '__proto__', 'constructor', 'toString', 'process', 'global'),
    scalar
  ),
  { maxLength: 3 }
)

const argIds = fc.oneof(
  fc.constantFrom('v', 'x', '__proto__', 'constructor'),
  scalar
)

const nodeArb = (depth: number): fc.Arbitrary<unknown> => {
  if (depth <= 0) return jsonLeaf

  const sub = () => nodeArb(depth - 1)

  const evaluatedCall = fc.tuple(
    fc.constant('call'),
    fc.tuple(fc.constant('ref'), fc.constantFrom('add', 'resolve', 'reject', 'noop', 'data')),
    fc.array(jsonLeaf, { maxLength: 1 })
  )

  const evaledCallWrapped = fc.array(evaluatedCall, { maxLength: 2 })
  const evaledCallWrapped2 = fc.tuple(fc.constant('await'), fc.array(evaluatedCall, { maxLength: 2 }))
  const evaledCallWrapped3 = fc.record({ key: evaluatedCall })

  return fc.oneof(
    jsonLeaf,
    evaledCallWrapped,
    evaledCallWrapped2,
    evaledCallWrapped3,
    fc.tuple(fc.constant('leaf'), jsonLeaf.map(v => JSON.stringify(v))),
    fc.tuple(fc.constant('ref'), refSegments),
    fc.tuple(fc.constant('await'), sub()),
    fc.tuple(fc.constant('quote'), sub()),
    fc.tuple(fc.constant('call'), sub(), fc.array(sub(), { maxLength: 3 })),
    fc.tuple(fc.constant('then'), sub(), sub(), fc.option(sub(), { nil: undefined })),
    fc.tuple(fc.constant('fn'), fc.oneof(sub(), fc.array(argIds, { maxLength: 3 })), sub()),
    fc.tuple(fc.constant('arg'), argIds),
    fc.array(sub(), { maxLength: 3 })
  )
}

const tick = () => new Promise(resolve => setTimeout(resolve, 25))

test('parse: any JSON payload is crash-safe (property, fast-check)', async () => {
  await fc.assert(
    fc.asyncProperty(nodeArb(2), async payload => {
      const payloadJson = JSON.stringify(payload)
      const parse = Parse(schema, env)

      unhandledHit = false
      unhandledReason = undefined

      let threw: unknown
      let caughtRejection: unknown

      try {
        const out = parse(payloadJson)

        try {
          await out
        } catch (e) {
          caughtRejection = e
        }
      } catch (e) {
        threw = e
      }

      await tick()

      threw = threw ?? caughtRejection

      assert.ok(
        threw === undefined || threw instanceof Error,
        'failures must be catchable errors, got: ' + String(threw)
      )

      assert.strictEqual(
        unhandledHit,
        false,
        'process-killing rejection for payload ' + payloadJson + ' with reason: ' + String(unhandledReason)
      )

      assert.strictEqual(({} as any).polluted, undefined, 'prototype polluted by ' + payloadJson)
      assert.strictEqual(({}).constructor, Object, 'Object.prototype.constructor changed by ' + payloadJson)
    }),
    { numRuns: 500 }
  )
})
