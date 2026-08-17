import { test } from 'tap'
import references from './references.mjs'
import Stringify from './stringify.mjs'

test('invalid uses of references', t => {
  t.throws(() => references([['a']]))
  t.throws(() => references([{}]))
  t.end()
})

test('native await hook is optional and backwards compatible', async t => {
  const schema = ['add', 'square', 'identity', ['nested', ['value']]]
  const stringify = Stringify()

  const defaultApi = references(schema)
  const defaultProgram = defaultApi.add(1, 2)

  t.doesNotThrow(() => stringify(defaultProgram))
  t.same(JSON.parse(stringify(defaultProgram))[0], 'call')

  const calls = []
  const api = references(schema, (program) => {
    calls.push(program)
    return 42
  })

  t.equal(await api.add(1, 2), 42)
  t.equal(calls.length, 1)
  t.equal(typeof calls[0], 'function')

  const asyncApi = references(schema, async () => {
    return await Promise.resolve(17)
  })

  t.equal(await asyncApi.identity(9), 17)

  const rejectedApi = references(schema, async () => {
    throw new Error('boom')
  })

  await t.rejects((async () => {
    await rejectedApi.identity(9)
  })(), { message: 'boom' })

  const thenApi = references(schema)
  const thenProgram = thenApi.add(1, 2).then(thenApi.square)
  t.same(JSON.parse(stringify(thenProgram))[0], 'then')

  const nestedApi = references([['outer', ['inner']]], (program) => program)
  t.equal(typeof nestedApi.outer.inner, 'function')
  t.same(JSON.parse(stringify(nestedApi.outer.inner(1)))[0], 'call')

  const onAwaitApi = references(['add'], (program) => {
    const serialized = stringify(program)
    t.same(JSON.parse(serialized), ['await', ['call', ['ref', 'add'], [['leaf', '1'], ['leaf', '2']]]])
    return 99
  })

  t.equal(await onAwaitApi.add(1, 2), 99)

  t.end()
})
