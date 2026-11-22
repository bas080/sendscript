import { test } from 'node:test'
import type { Schema } from './schema.ts'
import assert from 'node:assert'
import references from './references.ts'
import Stringify from './stringify.ts'

test('invalid uses of references', () => {
  assert.throws(() => references([['a']] as any))
  assert.throws(() => references([{}] as any))
})

test('native await hook is optional and backwards compatible', async t => {
  const schema: Schema = ['add', 'square', 'identity', ['nested', ['value']]]
  const stringify = Stringify()

  const defaultApi = references(schema)
  const defaultProgram = defaultApi.add(1, 2)

  assert.doesNotThrow(() => stringify(defaultProgram))
  assert.deepEqual(JSON.parse(stringify(defaultProgram))[0], 'call')

  const calls: unknown[] = []
  const api = references(schema, (program) => {
    calls.push(program)
    return 42
  })

  assert.equal(await api.add(1, 2), 42)
  assert.equal(calls.length, 1)
  assert.equal(typeof calls[0], 'function')

  const asyncApi = references(schema, async () => {
    return await Promise.resolve(17)
  })

  assert.equal(await asyncApi.identity(9), 17)

  const rejectedApi = references(schema, async () => {
    throw new Error('boom')
  })

  await assert.rejects(async () => {
    await rejectedApi.identity(9)
  }, { message: 'boom' })

  const thenApi = references(schema)
  const thenProgram = thenApi.add(1, 2).then(thenApi.square)
  assert.deepEqual(JSON.parse(stringify(thenProgram))[0], 'then')

  const nestedApi = references([['outer', ['inner']]], (program) => program)
  assert.equal(typeof nestedApi.outer.inner, 'function')
  assert.deepEqual(JSON.parse(stringify(nestedApi.outer.inner(1)))[0], 'call')

  const onAwaitApi = references(['add'], (program) => {
    const serialized = stringify(program)
    assert.deepEqual(JSON.parse(serialized), ['await', ['call', ['ref', 'add'], [['leaf', '1'], ['leaf', '2']]]])
    return 99
  })

  assert.equal(await onAwaitApi.add(1, 2), 99)
})
