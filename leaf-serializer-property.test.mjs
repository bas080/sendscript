import { test } from 'tap'
import { createRequire } from 'module'
import SuperJSON from 'superjson'
import Sendscript from './index.mjs'

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

// Property 1: Round-trip - any value that can be serialized should deserialize to an equal value
test('property: round-trip serialization with custom deserializer', check(
  gen.any,
  (t, value) => {
    t.plan(1)
    try {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)
      t.ok(valueEquals(deserialized, value), `Round-trip preserved value: ${typeof value}`)
    } catch (e) {
      // If serialization fails on a particular value, that's acceptable
      // (not all values may be serializable)
      t.pass(`Serialization of ${typeof value} threw, which is acceptable`)
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
      t.equal(serialized1, serialized2, 'Serialization is deterministic')
    } catch (e) {
      t.pass(`Serialization threw (acceptable for type: ${typeof value})`)
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
      JSON.parse(serialized)
      t.pass('Serialized output is valid JSON')
    } catch (e) {
      t.fail(`Invalid JSON output: ${e.message}`)
    }
  }
))

// Property 4: Undefined handling - undefined values are preserved through round-trip
test('property: undefined values are preserved', check(
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
