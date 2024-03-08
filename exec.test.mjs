import { test } from 'tap'
import api from './api.mjs'
import exec from './exec.mjs'

test('should evaluate basic expressions correctly', async (t) => {
  const module = {
    add: (a, b) => a + b,
    identity: x => x,
    concat: (a, b) => a.concat(b),
    always: x => () => x,
    multiply3: a => b => c => a * b * c
  }

  const evaluate = exec(module)
  const { add, concat, identity, always, multiply3 } = api(Object.keys(module), program =>
    evaluate(JSON.parse(JSON.stringify(program))))

  t.equal(
    await evaluate(add(1, 2)),
    3
  )

  t.strictSame(
    await evaluate([]),
    []
  )

  t.strictSame(
    await evaluate(concat([1, 2], [[add(1, 2)]])),
    [1, 2, [3]]
  )

  t.strictSame(
    await evaluate(concat([1, 2], [add(1, 2), add(2, 2)])),
    [1, 2, 3, 4]
  )

  t.strictSame(
    await evaluate([identity(1), 2, 3]),
    [1, 2, 3]
  )

  // Function that returns a function.
  t.strictSame(
    await evaluate(always('hello')()),
    'hello'
  )

  t.strictSame(
    await evaluate(multiply3(1)(2)(3)),
    6
  )

  t.rejects(async () => {
    await evaluate(['ref', 'doesNotExist'])
  })

  t.end()
})
