import { test } from 'tap'
import SuperJSON from 'superjson'
import Parse from './parse.mjs'
import Stringify from './stringify.mjs'

const leafSerializer = (value) => {
  if (value === undefined) return JSON.stringify({ __sendscript_undefined__: true })
  return JSON.stringify(SuperJSON.serialize(value))
}

const leafDeserializer = (text) => {
  const parsed = JSON.parse(text)
  if (parsed && parsed.__sendscript_undefined__ === true) return undefined
  return SuperJSON.deserialize(parsed)
}

const module = {
  identity: (x) => x
}

const schema = Object.keys(module)

const run = (program, serializer, deserializer) => {
  const parse = Parse(schema, module, deserializer)
  const stringify = Stringify(serializer)

  return parse(stringify(program))
}

test('custom leaf serializer/deserializer using superjson', async (t) => {
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

  const result = await run(value, leafSerializer, leafDeserializer)

  t.ok(result.date instanceof Date)
  t.equal(result.date.toISOString(), value.date.toISOString())

  t.ok(result.regex instanceof RegExp)
  t.equal(result.regex.source, 'abc')
  t.equal(result.regex.flags, 'gi')

  t.equal(result.big, value.big)

  t.ok(Object.prototype.hasOwnProperty.call(result, 'undef'))
  t.equal(result.undef, undefined)

  t.ok(result.nested.set instanceof Set)
  t.strictSame(Array.from(result.nested.set), [1, 2, 3])

  t.ok(result.nested.map instanceof Map)
  t.strictSame(Array.from(result.nested.map.entries()), [['a', 1], ['b', 2]])

  t.end()
})

test('default leaf deserializer when not provided', async (t) => {
  const value = { a: 1, b: 'hello' }
  const result = await run(value)

  t.strictSame(result, value)
  t.end()
})
