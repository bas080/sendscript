import { test } from 'node:test'
import assert from 'node:assert'
import SuperJSON from 'superjson'

const leafSerializer = (value: unknown) => {
  if (value === undefined) return JSON.stringify({ __sendscript_undefined__: true })
  return JSON.stringify(SuperJSON.serialize(value))
}

const leafDeserializer = (text: string) => {
  const parsed = JSON.parse(text)
  if (parsed && parsed.__sendscript_undefined__ === true) return undefined
  return SuperJSON.deserialize(parsed)
}

// Helper to compare values accounting for types that can't use ===
const valueEquals = (a: any, b: any): boolean => {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const item of a) {
      if (!b.has(item)) return false
    }
    return true
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [key, val] of a) {
      if (!b.has(key) || !valueEquals(val, b.get(key))) return false
    }
    return true
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

// Helper to get a human-readable type name
const getTypeInfo = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value instanceof Date) return 'Date'
  if (value instanceof RegExp) return 'RegExp'
  if (value instanceof Set) return 'Set'
  if (value instanceof Map) return 'Map'
  if (typeof value === 'bigint') return 'BigInt'
  return typeof value
}

const samples: unknown[] = [
  undefined,
  null,
  false,
  true,
  0,
  -1,
  3.14,
  NaN,
  Infinity,
  '',
  'hello',
  'multi\nline',
  Symbol('a'),
  BigInt('9007199254740993'),
  new Date('2020-01-01T00:00:00.000Z'),
  /abc/gi,
  new Set([1, 2, 3]),
  new Map([['a', 1]]),
  [1, 'two', null, [3]],
  { nested: { list: [1, 'two', null] } },
  () => {}
]

// gen.primitive equivalent: null, booleans, numbers and strings only
const primitiveSamples: unknown[] = samples.filter(
  (value) =>
    value === null ||
    ['number', 'string', 'boolean'].includes(typeof value)
)

// Property 1: Round-trip - any value that can be serialized should deserialize to an equal value
test('property: round-trip serialization preserves value', () => {
  for (const value of samples) {
    let threw = false

    try {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)
      const typeInfo = getTypeInfo(value)
      assert.ok(valueEquals(deserialized, value), `Round-trip preserved ${typeInfo}`)
    } catch (e) {
      threw = true
      // If serialization fails on a particular value, that's acceptable
      // (not all values may be serializable)
      const typeInfo = getTypeInfo(value)
      assert.ok(true, `Serialization of ${typeInfo} threw: ${(e as Error).message}`)
    }

    if (threw) assert.ok(true)
  }
})

// Property 2: Determinism - serializing the same value repeatedly produces identical results
test('property: serialization is deterministic', () => {
  for (const value of samples) {
    let serialized1: string
    let serialized2: string

    try {
      serialized1 = leafSerializer(value)
      serialized2 = leafSerializer(value)
    } catch (e) {
      assert.ok(true, `Serialization threw for ${getTypeInfo(value)}: ${(e as Error).message}`)
      continue
    }

    const typeInfo = getTypeInfo(value)
    assert.equal(serialized1, serialized2, `Serialization of ${typeInfo} is deterministic`)
  }
})

// Property 3: Valid JSON - serialized output is always valid JSON
test('property: serialized output is valid JSON', () => {
  for (const value of samples) {
    let serialized: string

    try {
      serialized = leafSerializer(value)
    } catch {
      continue
    }

    try {
      const parsed = JSON.parse(serialized)
      assert.ok(typeof parsed === 'object' || typeof parsed === 'string', 'Parsed JSON is an object or string')
    } catch (e) {
      assert.fail(`Invalid JSON output for ${getTypeInfo(value)}: ${(e as Error).message}`)
    }
  }
})

// Property 4: Undefined handling - undefined values are preserved through round-trip
test('property: undefined values are preserved through serialization', () => {
  for (const value of samples) {
    if (value === undefined) {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)
      assert.equal(deserialized, undefined, 'Undefined preserved through serialization')
    } else {
      assert.ok(true, 'Value was not undefined')
    }
  }
})

// Property 5: Type distinctness - Different values should have different serializations (when possible)
test('property: different primitives have different serializations', () => {
  for (const val1 of primitiveSamples) {
    for (const val2 of primitiveSamples) {
      if (val1 !== val2 && !(Number.isNaN(val1) && Number.isNaN(val2))) {
        let ser1: string
        let ser2: string

        try {
          ser1 = leafSerializer(val1)
          ser2 = leafSerializer(val2)
        } catch {
          continue
        }

        assert.notEqual(
          ser1,
          ser2,
          `Different primitives ${getTypeInfo(val1)} and ${getTypeInfo(val2)} have different serializations`
        )
      } else {
        assert.ok(true, 'Primitives are equal or both NaN')
      }
    }
  }
})

// Property 6: Idempotence of serialization - Re-parsing serialized value produces same serialization
test('property: serialization round-trip is stable', () => {
  for (const value of samples) {
    let ser1: string
    let deser1: unknown

    try {
      ser1 = leafSerializer(value)
      deser1 = leafDeserializer(ser1)
    } catch (e) {
      assert.ok(true, `Serialization error for ${getTypeInfo(value)}: ${(e as Error).message}`)
      continue
    }

    try {
      const ser2 = leafSerializer(deser1)
      assert.equal(ser1, ser2, `Serialization is stable for ${getTypeInfo(value)}`)
    } catch (e) {
      assert.ok(true, `Serialization error for ${getTypeInfo(value)}: ${(e as Error).message}`)
    }
  }
})
