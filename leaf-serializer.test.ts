import { test } from 'node:test'
import assert from 'node:assert'
import SuperJSON from 'superjson'
import Parse from './parse.ts'
import Stringify from './stringify.ts'

const leafSerializer = (value: unknown) => {
  if (value === undefined) return JSON.stringify({ __sendscript_undefined__: true })
  return JSON.stringify(SuperJSON.serialize(value))
}

const leafDeserializer = (text: string) => {
  const parsed = JSON.parse(text)
  if (parsed && parsed.__sendscript_undefined__ === true) return undefined
  return SuperJSON.deserialize(parsed)
}

const module = {
  identity: (x: unknown) => x
}

const schema = Object.keys(module)

const run = (program: unknown, serializer?: typeof leafSerializer, deserializer?: typeof leafDeserializer) => {
  const parse = Parse(schema, module, deserializer)
  const stringify = Stringify(serializer)

  return parse(stringify(program))
}

test('custom leaf serializer/deserializer using superjson', async () => {
  const value = {
    date: new Date('2020-01-01T00:00:00.000Z'),
    regex: /abc/gi,
    big: BigInt('123456789012345678901234567890'),
    undef: undefined,
    nested: {
      set: new Set([1, 2, 3]),
      map: new Map([['a', 1], ['b', 2]])
    }
  }

  const result: any = await run(value, leafSerializer, leafDeserializer)

  assert.ok(result.date instanceof Date)
  assert.equal(result.date.toISOString(), value.date.toISOString())

  assert.ok(result.regex instanceof RegExp)
  assert.equal(result.regex.source, 'abc')
  assert.equal(result.regex.flags, 'gi')

  assert.equal(result.big, value.big)

  assert.ok(Object.prototype.hasOwnProperty.call(result, 'undef'))
  assert.equal(result.undef, undefined)

  assert.ok(result.nested.set instanceof Set)
  assert.deepStrictEqual(Array.from(result.nested.set), [1, 2, 3])

  assert.ok(result.nested.map instanceof Map)
  assert.deepStrictEqual(Array.from(result.nested.map.entries()), [['a', 1], ['b', 2]])
})

test('default leaf deserializer when not provided', async () => {
  const value = { a: 1, b: 'hello' }
  const result = await run(value)

  assert.deepStrictEqual(result, value)
})
