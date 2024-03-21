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
  hello: 'world',
  noop: () => {},
  resolve: x => Promise.resolve(x),
  asyncFn: async () => 'my-async-function',
  instanceOf: (x, t) => x instanceof t,
  Function,
  Promise,
}

test('should evaluate basic expressions correctly', async (t) => {
  const evaluate = exec(module)
  const { resolve, Function, Promise, instanceOf, promise, asyncFn, hello, map, toArray, add, concat, identity, always, multiply3 } = api(
    Object.keys(module),
    // Emulate serialization and de-serialization
    async (program) => JSON.parse(JSON.stringify(await evaluate(program)))
  )


  t.strictSame(
    await identity([
      identity(1),
      identity(2),
      identity(3),
      identity(4),
    ]),
    [ 1,2,3,4 ]
  );

  t.rejects(async () => {
    await evaluate('["ref", "notDefined"]')
  })

  t.equal(
    await identity(null),
    null
  )

  // Somewhat unexpected but JSON.stringify changes undefined to null when it
  // is in an object
  t.equal(JSON.stringify([undefined]), '[null]')
  t.equal(
    await identity(undefined),
    null
  )

  // Consider using a different JSON.stringify if you want to support
  // stringify-ing undefined.
  t.rejects(async () => {
    await noop()
  })

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

  t.strictSame(
    await asyncFn(),
    'my-async-function'
  )

  t.strictSame(
    await resolve('my-promise'),
    'my-promise'
  )

  // TODO: Supports passing a promise as a function argument
  // t.strictSame(
  //   await instanceOf(resolve(asyncFn), Promise),
  //   true
  // )

  // TODO: Supports awaiting a promise returned from a function call
  // t.strictSame(
  //   await instanceOf(await resolve(asyncFn), Function),
  //   true
  // )

  t.end()
})
