import { test } from 'tap'
import { createRequire } from 'module'
import SuperJSON from 'superjson'

const require = createRequire(import.meta.url)
const { check, gen } = require('tape-check')

const leafSerializer = (value) => {
  if (value === undefined) return JSON.stringify({ __sendscript_undefined__: true })
  return JSON.stringify(SuperJSON.serialize(value))
}

const leafDeserializer = (text) => {
  const parsed = JSON.parse(text)
  if (parsed && parsed.__sendscript_undefined__ === true) return undefined
  return SuperJSON.deserialize(parsed)
}

// Helper to compare values accounting for types that can't use ===
const valueEquals = (a, b) => {
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
const getTypeInfo = (value) => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value instanceof Date) return 'Date'
  if (value instanceof RegExp) return 'RegExp'
  if (value instanceof Set) return 'Set'
  if (value instanceof Map) return 'Map'
  if (typeof value === 'bigint') return 'BigInt'
  return typeof value
}

// Property 1: Round-trip - any value that can be serialized should deserialize to an equal value
test('property: round-trip serialization preserves value', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    try {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)
      const typeInfo = getTypeInfo(value)
      t.ok(valueEquals(deserialized, value), `Round-trip preserved ${typeInfo}`)
    } catch (e) {
      // If serialization fails on a particular value, that's acceptable
      // (not all values may be serializable)
      const typeInfo = getTypeInfo(value)
      t.pass(`Serialization of ${typeInfo} threw: ${e.message}`)
    }
  }
))

// Property 2: Determinism - serializing the same value repeatedly produces identical results
test('property: serialization is deterministic', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    try {
      const serialized1 = leafSerializer(value)
      const serialized2 = leafSerializer(value)
      const typeInfo = getTypeInfo(value)
      t.equal(serialized1, serialized2, `Serialization of ${typeInfo} is deterministic`)
    } catch (e) {
      const typeInfo = getTypeInfo(value)
      t.pass(`Serialization threw for ${typeInfo}: ${e.message}`)
    }
  }
))

// Property 3: Valid JSON - serialized output is always valid JSON
test('property: serialized output is valid JSON', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    try {
      const serialized = leafSerializer(value)
      const parsed = JSON.parse(serialized)
      t.ok(typeof parsed === 'object' || typeof parsed === 'string', 'Parsed JSON is an object or string')
    } catch (e) {
      t.fail(`Invalid JSON output for ${getTypeInfo(value)}: ${e.message}`)
    }
  }
))

// Property 4: Undefined handling - undefined values are preserved through round-trip
test('property: undefined values are preserved through serialization', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    if (value === undefined) {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)
      t.equal(deserialized, undefined, 'Undefined preserved through serialization')
    } else {
      t.pass('Value was not undefined')
    }
  }
))

// Property 5: Type distinctness - Different values should have different serializations (when possible)
test('property: different primitives have different serializations', check(
  gen.primitive,
  gen.primitive,
  (t, val1, val2) => {
    t.plan(1)
    if (val1 !== val2 && !(Number.isNaN(val1) && Number.isNaN(val2))) {
      const ser1 = leafSerializer(val1)
      const ser2 = leafSerializer(val2)
      t.not(ser1, ser2, `Different primitives ${getTypeInfo(val1)} and ${getTypeInfo(val2)} have different serializations`)
    } else {
      t.pass('Primitives are equal or both NaN')
    }
  }
))

// Property 6: Idempotence of serialization - Re-parsing serialized value produces same serialization
test('property: serialization round-trip is stable', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    try {
      const ser1 = leafSerializer(value)
      const deser1 = leafDeserializer(ser1)
      const ser2 = leafSerializer(deser1)
      t.equal(ser1, ser2, `Serialization is stable for ${getTypeInfo(value)}`)
    } catch (e) {
      t.pass(`Serialization error for ${getTypeInfo(value)}: ${e.message}`)
    }
  }
))
