import { test } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import Parse from './parse.ts'
import { SendScriptReferenceError } from './error.ts'
import type { Schema, SchemaNode } from './schema.ts'

const OPS: Record<string, (x: unknown) => unknown> = {
  id: x => x,
  wrap: x => (Array.isArray(x) ? x : [x]),
  enc: x => ({ out: x }),
  later: x => Promise.resolve({ out: x })
}

type OpName = keyof typeof OPS

type LeafModel = { name: string; op: OpName }
type NsModel = { name: string; leaves: LeafModel[] }
type Model = {
  schema: Schema
  env: Record<string, unknown>
  paths: { path: string[]; op: OpName }[]
}

const buildModel = (rootLeaves: LeafModel[], nss: NsModel[]): Model => {
  const env: Record<string, unknown> = {}
  const paths: Model['paths'] = []

  for (const leaf of rootLeaves) {
    env[leaf.name] = OPS[leaf.op]

    if (!paths.some(p => p.path.length === 1 && p.path[0] === leaf.name)) {
      paths.push({ path: [leaf.name], op: leaf.op })
    }
  }

  for (const ns of nss) {
    const members = new Map(ns.leaves.map(l => [l.name, l.op]))

    env[ns.name] = Object.fromEntries([...members].map(([name, op]) => [name, OPS[op]]))

    for (const [name, op] of members) {
      paths.push({ path: [ns.name, name], op })
    }
  }

  const schema: Schema = [
    ...rootLeaves.map(l => l.name),
    ...nss.map(ns => [ns.name, ns.leaves.map(l => l.name)] as SchemaNode)
  ]

  return { schema, env, paths }
}

const arbLeaf = fc.record({
  name: fc.constantFrom('a', 'b', 'c'),
  op: fc.constantFrom('id','wrap','enc','later' as never)
}) as fc.Arbitrary<LeafModel>

const arbNs: fc.Arbitrary<NsModel> = fc.record({
  name: fc.constantFrom('n1', 'n2'),
  leaves: fc.array(arbLeaf, { minLength: 1, maxLength: 3 })
})

const arbModel = fc
  .record({
    rootLeaves: fc.uniqueArray(arbLeaf, { minLength: 1, maxLength: 3, selector: (l: LeafModel) => l.name }),
    nss: fc.uniqueArray(arbNs, { maxLength: 2, selector: (ns: NsModel) => ns.name })
  })
  .map(bits => buildModel(bits.rootLeaves, bits.nss))

const scalar = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string({ maxLength: 6 })
)

const arbJson: fc.Arbitrary<unknown> = fc.oneof(scalar, fc.array(scalar, { maxLength: 2 }))

type Case = {
  model: Model
  program: unknown
  shouldThrow: boolean
  expect: unknown
}

const arbCase: fc.Arbitrary<Case> = fc
  .record({
    model: arbModel,
    kind: fc.constantFrom('call', 'fn-id', 'fn-call', 'quote', 'await-leaf', 'await-call', 'bad-ref'),
    json: arbJson,
    json2: scalar,
    pathIndex: fc.nat(),
    badToken: fc.constantFrom('zz', 'constructor', 'prototype', '__proto__', 'toString', 'process', 'global')
  })
  .map(bits => {
    const { model, kind, json, json2, pathIndex, badToken } = bits
    const target = model.paths[pathIndex % model.paths.length]
    const leaf = (v: unknown) => ['leaf', JSON.stringify(v)]

    if (kind === 'call') {
      return {
        model,
        program: ['call', ['ref', ...target.path], [leaf(json)]],
        shouldThrow: false,
        expect: OPS[target.op](json)
      }
    }

    if (kind === 'fn-id') {
      return {
        model,
        program: ['call', ['fn', ['v'], ['arg', 'v']], [leaf(json)]],
        shouldThrow: false,
        expect: json
      }
    }

    if (kind === 'fn-call') {
      return {
        model,
        program: ['call', ['fn', ['v'], ['call', ['ref', ...target.path], [['arg', 'v']]]], [leaf(json)]],
        shouldThrow: false,
        expect: OPS[target.op](json)
      }
    }

    if (kind === 'quote') {
      const raw = [json, json2]

      return {
        model,
        program: ['quote', raw],
        shouldThrow: false,
        expect: raw
      }
    }

    if (kind === 'await-leaf') {
      return {
        model,
        program: ['await', leaf(json)],
        shouldThrow: false,
        expect: json
      }
    }

    if (kind === 'await-call') {
      return {
        model,
        program: ['await', ['call', ['ref', ...target.path], [leaf(json)]]],
        shouldThrow: false,
        expect: OPS[target.op](json)
      }
    }

    const path = [...target.path.slice(0, -1), badToken]

    return {
      model,
      program: ['call', ['ref', ...path], [leaf(json)]],
      shouldThrow: true,
      expect: undefined
    }
  })

const tick = () => new Promise(resolve => setTimeout(resolve, 25))

test('parse evaluates valid programs and rejects invalid refs (property, fast-check)', async () => {
  await fc.assert(
    fc.asyncProperty(arbCase, async (c: Case) => {
      const parse = Parse(c.model.schema, c.model.env)

      if (c.shouldThrow) {
        assert.throws(() => parse(JSON.stringify(c.program)), SendScriptReferenceError)
        return
      }

      await tick()
      const out = parse(JSON.stringify(c.program))

      assert.deepStrictEqual(await out, await c.expect)
    }),
    { numRuns: 300 }
  )
})

process.on('unhandledRejection', () => {
  throw new Error('unexpected unhandledRejection during property test')
})
