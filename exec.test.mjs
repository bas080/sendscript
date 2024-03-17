import { test } from 'tap'
import api from './api.mjs'
import exec from './exec.mjs'

const module = {
  add: (a, b) => a + b,
  identity: x => x,
  concat: (a, b) => a.concat(b),
  toArray: (...array) => array,
  always: x => () => x,
  multiply3: a => b => c => a * b * c,
  map: fn => array => array.map(fn),
  filter: pred => array => array.filter(pred),
  hello: 'world'
}

test('should evaluate basic expressions correctly', async (t) => {
  const evaluate = exec(module)
  const { hello, map, toArray, add, concat, identity, always, multiply3 } = api(
    Object.keys(module),
    evaluate
  )

  t.rejects(async () => {
    await evaluate('["ref", "notDefined"]')
  })

  t.equal(
    await identity(null),
    null
  )

  // Undefined is converted to null because native JSON serialization does not support undefined.
  t.equal(
    await identity(undefined),
    null
  )

  t.equal(
    await hello,
    'world'
  )

  t.equal(
    await add(1, 2),
    3
  )

  t.equal(
    await identity(1),
    1
  )

  t.strictSame(
    await identity([]),
    []
  )

  // Objects
  t.strictSame(
    await identity({ a: identity(1), b: always(2)() }),
    {
      a: 1,
      b: 2
    }
  )

  t.strictSame(
    await concat([1, 2], [[add(1, 2)]]),
    [1, 2, [3]]
  )

  t.strictSame(
    await concat([1, 2], [add(1, 2), add(2, 2)]),
    [1, 2, 3, 4]
  )

  t.strictSame(
    await identity([identity(1), 2, 3]),
    [1, 2, 3]
  )

  // Function that returns a function.
  t.strictSame(
    await always('hello')(),
    'hello'
  )

  // Point free style supported.
  t.strictSame(
    await map(identity)([1, 2, 3, 4]),
    [1, 2, 3, 4]
  )

  t.strictSame(
    await multiply3(1)(2)(3),
    6
  )

  t.strictSame(
    await identity(['ref', 'doesNotExist']),
    ['ref', 'doesNotExist']
  )

  // Yes yes yes, this works now! Thank you quote keyword.
  t.strictSame(
    await identity(['ref', 'hello']),
    await identity(toArray('ref', 'hello'))
  )

  t.end()
})
