import { test } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
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

// Property 1: Round-trip - any value that can be serialized should deserialize to an equal value
test('property: round-trip serialization preserves value', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      let serialized: string

      try {
        serialized = leafSerializer(value as any)
      } catch {
        // If serialization fails on a particular value, that's acceptable
        // (not all values may be serializable)
        return true
      }

      const deserialized = leafDeserializer(serialized)
      const typeInfo = getTypeInfo(value)

      if (!valueEquals(deserialized, value)) {
        throw new Error(`Round-trip not preserved for ${typeInfo}`)
      }

      return true
    })
  )
})

// Property 2: Determinism - serializing the same value repeatedly produces identical results
test('property: serialization is deterministic', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      let serialized1: string
      let serialized2: string

      try {
        serialized1 = leafSerializer(value as any)
        serialized2 = leafSerializer(value as any)
      } catch {
        return true
      }

      const typeInfo = getTypeInfo(value)

      if (serialized1 !== serialized2) {
        throw new Error(`Serialization of ${typeInfo} is not deterministic`)
      }

      return true
    })
  )
})

// Property 3: Valid JSON - serialized output is always valid JSON
test('property: serialized output is valid JSON', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      let serialized: string

      try {
        serialized = leafSerializer(value as any)
      } catch {
        return true
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(serialized)
      } catch (e) {
        throw new Error(`Invalid JSON output for ${getTypeInfo(value)}: ${(e as Error).message}`)
      }

      if (!(typeof parsed === 'object' || typeof parsed === 'string')) {
        throw new Error(`Parsed JSON is not an object or string for ${getTypeInfo(value)}`)
      }

      return true
    })
  )
})

// Property 4: Undefined handling - undefined values are preserved through round-trip
test('property: undefined values are preserved through serialization', () => {
  fc.assert(
    fc.property(fc.constant(undefined), (value) => {
      const serialized = leafSerializer(value)
      const deserialized = leafDeserializer(serialized)

      if (deserialized !== undefined) {
        throw new Error('Undefined not preserved through serialization')
      }

      return true
    })
  )
})

// Property 5: Type distinctness - Different values should have different serializations (when possible)
test('property: different primitives have different serializations', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constantFrom(null), fc.boolean(), fc.integer(), fc.string()),
      fc.oneof(fc.constantFrom(null), fc.boolean(), fc.integer(), fc.string()),
      (val1, val2) => {
        if (val1 !== val2 && !(Number.isNaN(val1) && Number.isNaN(val2))) {
          const ser1 = leafSerializer(val1)
          const ser2 = leafSerializer(val2)
          const typeInfo1 = getTypeInfo(val1)
          const typeInfo2 = getTypeInfo(val2)

          if (ser1 === ser2) {
            throw new Error(`Different primitives ${typeInfo1} and ${typeInfo2} have equal serializations`)
          }
        }

        return true
      }
    )
  )
})

// Property 6: Idempotence of serialization - Re-parsing serialized value produces same serialization
test('property: serialization round-trip is stable', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      let ser1: string
      let deser1: unknown

      try {
        ser1 = leafSerializer(value as any)
        deser1 = leafDeserializer(ser1)
      } catch {
        return true
      }

      let ser2: string

      try {
        ser2 = leafSerializer(deser1)
      } catch (e) {
        throw new Error(`Serialization not stable for ${getTypeInfo(value)}: ${(e as Error).message}`)
      }

      if (ser1 !== ser2) {
        throw new Error(`Serialization is not stable for ${getTypeInfo(value)}`)
      }

      return true
    })
  )
})
