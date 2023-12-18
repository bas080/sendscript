import { test } from 'tap'
import api from './api.mjs'
import exec from './exec.mjs'

test('should evaluate basic expressions correctly', async (t) => {
  const module = {
    add: (a, b) => a + b,
    identity: x => x,
    concat: (a, b) => a.concat(b)
  }

  const evaluate = exec(module)
  const { add, concat, identity } = api(Object.keys(module), program =>
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

  t.end()
})
