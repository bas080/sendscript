import { test } from 'tap'
import Sendscript from './index.mjs'

const module = {
  add: (a, b) => a + b,
  identity: (x) => x,
  concat: (a, b) => a.concat(b),
  toArray: (...array) => array,
  always: (x) => () => x,
  multiply3: (a) => (b) => (c) => a * b * c,
  map: (fn) => (array) => array.map(fn),
  filter: (pred) => (array) => array.filter(pred),
  hello: 'world',
  noop: () => {},
  resolve: (x) => Promise.resolve(x),
  asyncFn: async () => 'my-async-function',
  instanceOf: (x, t) => x instanceof t,
  asyncAdd: async (a, b) => a + b,
  aPromise: Promise.resolve(42),
  delayedIdentity: async (x) => x,
  Function,
  Promise
}

const sendscript = Sendscript(module)
const { parse, stringify } = sendscript
const run = (program) => parse(stringify(program))

const RealPromise = Promise

test('should evaluate basic expressions correctly', async (t) => {
  const {
    aPromise,
    asyncAdd,
    resolve,
    delayedIdentity,
    noop,
    Function,
    Promise,
    instanceOf,
    asyncFn,
    hello,
    map,
    toArray,
    add,
    concat,
    identity,
    always,
    multiply3
  } = sendscript.module

  t.test('nested await works', async (t) => {
    // Async identity passthrough
    const resolvedId = await delayedIdentity

    t.equal(await run(resolvedId('X')), 'X')

    t.end()
  })

  t.test('deep nested awaits', async (t) => {
    const nested = async () => await RealPromise.resolve(await delayedIdentity('deep'))
    t.equal(await run(await nested()), 'deep')
    t.end()
  })

  t.test('awaits in nested array structure', async (t) => {
    const arr = [
      await resolve(1),
      [await resolve(2), [await resolve(3)]],
      await delayedIdentity(4)
    ]
    t.same(await run(arr), [1, [2, [3]], 4])
    t.end()
  })

  t.test('awaits in deeply nested object structure', async (t) => {
    const obj = {
      a: await resolve('a'),
      b: {
        c: await delayedIdentity('c'),
        d: {
          e: await resolve('e')
        }
      }
    }
    t.same(await run(obj), {
      a: 'a',
      b: {
        c: 'c',
        d: { e: 'e' }
      }
    })
    t.end()
  })

  t.test('await as computed value inside nested async function', async (t) => {
    const asyncOuter = async () => {
      const val = await delayedIdentity('nested')
      return val
    }
    t.equal(await run(await asyncOuter()), 'nested')
    t.end()
  })

  // return t.end()

  t.test('promise resolution', async (t) => {
    t.equal(await run(identity(await aPromise)), 42)
    t.strictSame(await run(asyncFn()), 'my-async-function')
    t.strictSame(await run(await resolve('my-promise')), 'my-promise')
    t.strictSame(run(instanceOf(resolve(asyncFn), Promise)), true)
    t.strictSame(
      await run(instanceOf(await resolve(asyncFn), Function)), true
    )
    t.strictSame(
      await run({ a: await resolve('b') }),
      { a: 'b' }
    )
  })

  await t.test('async and promise handling', async (t) => {
    // Await inside run input
    const resolvedAdd = await RealPromise.resolve(asyncAdd)
    t.equal(await run(resolvedAdd(2, 3)), 5)

    // Using asyncFn in a nested structure
    const nestedAsync = async () => await asyncFn()
    t.equal(await run(await nestedAsync()), 'my-async-function')

    // Awaiting inside object structure
    t.same(await run({
      type: 'response',
      data: await resolve('some-data')
    }), {
      type: 'response',
      data: 'some-data'
    })

    t.end()
  })

  t.test('basic types and identity', (t) => {
    t.equal(run(identity(null)), null)
    t.equal(run(identity(undefined)), null)
    t.equal(run(noop()), undefined)
    t.equal(run(identity(1)), 1)
    t.strictSame(run(identity([])), [])
    t.strictSame(run(identity([identity(1), 2, 3])), [1, 2, 3])
    t.strictSame(run(always('hello')()), 'hello')
    t.end()
  })

  t.test('objects and arrays', (t) => {
    t.strictSame(
      run(identity({ a: identity(1), b: always(2)(), c: add(1, 2) })),
      { a: 1, b: 2, c: 3 }
    )
    t.strictSame(run(concat([1, 2], [[add(1, 2)]])), [1, 2, [3]])
    t.strictSame(run(concat([1, 2], [add(1, 2), add(2, 2)])), [1, 2, 3, 4])
    t.strictSame(run(map(identity)([1, 2, 3, 4])), [1, 2, 3, 4])
    t.end()
  })

  t.test('function composition and currying', (t) => {
    t.strictSame(run(multiply3(1)(2)(3)), 6)
    t.end()
  })

  t.test('special cases and errors', (t) => {
    t.throws(() => parse('["ref", "notDefined"]'))
    t.strictSame(
      run(identity(['ref', 'doesNotExist'])),
      ['ref', 'doesNotExist']
    )
    t.strictSame(
      run(identity(['ref', 'hello'])),
      run(identity(toArray('ref', 'hello')))
    )
    t.end()
  })

  t.test('primitives and built-ins', (t) => {
    t.equal(JSON.stringify([undefined]), '[null]')
    t.equal(run(hello), 'world')
    t.equal(run(add(1, 2)), 3)
    t.end()
  })

  t.test('identity with arrays', (t) => {
    t.strictSame(
      run(identity([identity(1), identity(2), identity(3), identity(4)])),
      [1, 2, 3, 4]
    )
    t.end()
  })
})
