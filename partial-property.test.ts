import { test } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import Partial from './partial.ts'
import type { Schema, SchemaNode } from './schema.ts'

function setPath (obj: any, path: string[], value: unknown): void {
  let curr = obj
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    if (!curr[seg] || typeof curr[seg] !== 'object') {
      curr[seg] = {}
    }
    curr = curr[seg]
  }
  curr[path[path.length - 1]] = value
}

function buildSchema (paths: string[][]): Schema {
  const tree: Record<string, any> = {}

  for (const path of paths) {
    let curr = tree
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i]
      if (typeof curr[seg] !== 'object' || curr[seg] === null) {
        curr[seg] = {}
      }
      curr = curr[seg]
    }
    const last = path[path.length - 1]
    if (!curr[last]) {
      curr[last] = true
    }
  }

  function convertToSchema (obj: Record<string, any>): Schema {
    const nodes: SchemaNode[] = []
    for (const [key, val] of Object.entries(obj)) {
      if (val === true) {
        nodes.push(key)
      } else {
        nodes.push([key, convertToSchema(val)])
      }
    }
    return nodes
  }

  return convertToSchema(tree)
}

const safeIdent = fc.stringMatching(/^[a-z][a-z0-9]{1,4}$/)
  .filter(s => !['constructor', 'prototype', '__proto__', 'toString', 'valueOf'].includes(s))

const scalar = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -1000, max: 1000 }),
  fc.string({ maxLength: 10 })
)

interface RefDef {
  path: string[]
  value: unknown
  envIndex: 1 | 2
}

const refDefArb: fc.Arbitrary<RefDef> = fc.record({
  // Path can be non-nested (length 1) or nested (length 2 or 3)
  path: fc.array(safeIdent, { minLength: 1, maxLength: 3 }),
  value: scalar,
  envIndex: fc.constantFrom<[1, 2]>(1, 2)
})

function prepareCase (rawDefs: RefDef[]) {
  const pathMap = new Map<string, RefDef>()
  for (const def of rawDefs) {
    const key = def.path.join('.')
    let collision = false
    for (const existingKey of pathMap.keys()) {
      if (existingKey === key || existingKey.startsWith(key + '.') || key.startsWith(existingKey + '.')) {
        collision = true
        break
      }
    }
    if (!collision) {
      pathMap.set(key, def)
    }
  }

  if (pathMap.size === 0) return null

  const defs = Array.from(pathMap.values())
  const paths = defs.map(d => d.path)
  const schema = buildSchema(paths)

  const env1: Record<string, any> = {}
  const env2: Record<string, any> = {}
  const programObj: Record<string, any> = {}
  const expectedObj: Record<string, any> = {}

  defs.forEach((def, idx) => {
    const propName = `prop_${idx}`
    programObj[propName] = ['ref', ...def.path]
    expectedObj[propName] = def.value

    if (def.envIndex === 1) {
      setPath(env1, def.path, def.value)
    } else {
      setPath(env2, def.path, def.value)
    }
  })

  return {
    schema,
    env1,
    env2,
    program: JSON.stringify(programObj),
    expectedObj
  }
}

test('property: running refs across two envs always finishes with done: true (async)', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(refDefArb, { minLength: 2, maxLength: 12 }),
      async (rawDefs) => {
        const c = prepareCase(rawDefs)
        if (!c) return

        // Stage 1: Evaluate against env1
        const stage1 = await Partial(c.schema, c.env1)(c.program)
        let finalResult = stage1

        if (!stage1.done) {
          // Stage 2: Evaluate remaining AST against env2
          const serializedAst = JSON.stringify(stage1.partial)
          finalResult = await Partial(c.schema, c.env2)(serializedAst)
        }

        // Must always be done: true after both environments have been evaluated
        assert.strictEqual(finalResult.done, true)
        assert.deepStrictEqual(finalResult.partial, c.expectedObj)
      }
    ),
    { numRuns: 200 }
  )
})

test('property: running refs across two envs always finishes with done: true (sync)', () => {
  fc.assert(
    fc.property(
      fc.array(refDefArb, { minLength: 2, maxLength: 12 }),
      (rawDefs) => {
        const c = prepareCase(rawDefs)
        if (!c) return

        // Stage 1: Evaluate synchronously against env1
        const stage1 = Partial(c.schema, c.env1)(c.program)
        assert.strictEqual(stage1 instanceof Promise, false)
        let finalResult = stage1

        if (!stage1.done) {
          // Stage 2: Evaluate remaining AST synchronously against env2
          const serializedAst = JSON.stringify(stage1.partial)
          finalResult = Partial(c.schema, c.env2)(serializedAst)
          assert.strictEqual(finalResult instanceof Promise, false)
        }

        // Must always be done: true after both environments have been evaluated
        assert.strictEqual(finalResult.done, true)
        assert.deepStrictEqual(finalResult.partial, c.expectedObj)
      }
    ),
    { numRuns: 200 }
  )
})
