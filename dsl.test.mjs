import { test } from 'tap'
import dsl from './dsl.mjs'

test('return a constant value', async t => {
  t.plan(1)

  const { constant } = dsl(['constant'], v => {
    t.equal(JSON.stringify(v), '["ref","constant"]')
  })

  await constant
})

test('use function calls as arguments', async t => {
  t.plan(4)

  const { add } = dsl(['add'], b => {
    t.equal(JSON.stringify(awaited), JSON.stringify(b))
    return 'done'
  })

  const program = add(add(add(1, 2), 3), 4)
  const awaited = program
  const thenned = program

  t.equal(await awaited, 'done')

  await thenned.then(result => {
    t.equal(result, 'done')
  })
})
