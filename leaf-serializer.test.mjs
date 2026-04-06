import { test } from 'tap'
import SuperJSON from 'superjson'
import Sendscript from './index.mjs'

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

const sendscript = Sendscript(module)
const { parse, stringify } = sendscript
const run = (program, serializer, deserializer) =>
  parse(stringify(program, serializer), deserializer)

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

test('fallback to default deserializer when null is passed', async (t) => {
  const value = { a: 1, b: 'hello' }
  const result = await parse(stringify(value), null)

  t.strictSame(result, value)
  t.end()
})

test('default leaf deserializer handles undefined parameter', (t) => {
  const parse = Sendscript({}).parse
  // Create a simple JSON with a leaf then parse using default deserializer
  // The reviver will never pass undefined to deserializer, but we test it defensively
  const json = '["leaf","{\\"test\\":1}"]'
  const result = parse(json)
  t.strictSame(result, { test: 1 })
  t.end()
})
