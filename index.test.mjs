import { test } from 'tap'
import Stringify from './stringify.mjs'
import references from './references.mjs'
import Parse from './parse.mjs'
import { SendScriptSerializationError } from './error.mjs'

const order = []

const myModuleOrig = {
  nested: {
    again: {
      T: () => true
    }
  },
  add: (a, b) => a + b,
  identity: (x) => x,
  concat: (a, b) => a.concat(b),
  delay: (value, ms) => {
    return new Promise(resolve => {
      order.push(`${value} start`)
      setTimeout(() => {
        order.push(`${value} end`)

        resolve(value)
      }, ms)
    })
  },
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
  nullProto: () => {
    const obj = Object.create(null)
    obj.b = 'c'
    return obj
  },
  Promise
}

// We want to support prototype chain when parsing.
const myModule = Object.create(myModuleOrig)
const schema = Object.keys(myModuleOrig)

schema.push(['nested', [
  ['again', ['T']]
]])

const api = references(schema)
const stringify = Stringify()
const parse = Parse(schema, myModule)

const run = (program) => parse(stringify(program))

const RealPromise = Promise

test('should evaluate basic expressions correctly', async (t) => {
  const {
    aPromise,
    asyncAdd,
    resolve,
    delay,
    delayedIdentity,
    noop,
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
    multiply3,
    nested
  } = api

  t.test('await evaluation order matches JS semantics', async (t) => {
    const lorder = []

    const ldelay = (label, ms) => new RealPromise((resolve) => {
      lorder.push(label + ' start')
      setTimeout(() => {
        lorder.push(label + ' end')
        resolve(label)
      }, ms)
    })

    const lresult = [
      await ldelay('a', 30),
      await ldelay('b', 10)
    ]

    t.same(lresult, ['a', 'b'])
    t.same(lorder, [
      'a start',
      'a end',
      'b start',
      'b end'
    ])

    // TODO: Write it what ss touches

    const result = await run([
      await delay('a', 30),
      await delay('b', 10)
    ])

    t.same(result, ['a', 'b'])
    t.same(order, [
      'a start',
      'a end',
      'b start',
      'b end'
    ])

    t.end()
  })

  t.test('mix await without await', async t => {
    const [one, two] = await run([await resolve(1), resolve(2)])

    t.equal(one, 1)
    t.ok(two instanceof RealPromise)

    t.end()
  })

  t.test('calling nested function works', t => {
    t.equal(run(nested.again.T()), true)

    t.end()
  })

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

  t.test('throws if stringify returns undefined', t => {
    // This is to prevent accidentally sending payloads that make little sense.

    // Check if it throw the expected error type.
    try {
      run(undefined)
    } catch (error) {
      t.ok(error instanceof SendScriptSerializationError)
    }

    t.throws(() => run(undefined))
    t.throws(() => run(new Set()))
    t.throws(() => run(identity(undefined)))
    t.throws(() => run(() => {}))

    t.end()
  })

  t.test('basic types and identity', (t) => {
    t.equal(run(identity(null)), null)
    t.equal(run(noop()), undefined)
    t.equal(run(identity(1)), 1)
    t.strictSame(run(identity([])), [])
    t.strictSame(run(identity({})), {})
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
    t.strictSame(
      run(identity(['leaf', 1, 2, 3])),
      ['leaf', 1, 2, 3]
    )
    t.end()
  })

  t.test('null-prototype object traversal', (t) => {
    const { nullProto } = api
    const other = myModule.nullProto()
    t.strictSame(run({ a: nullProto() }), { a: other })
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

test('stringify: invalid children throws', t => {
  const invalidSchema = [
    ['math', 'add']
  ]

  t.throws(() => Parse(invalidSchema, {}))
  t.throws(() => Parse([Symbol('no-allowed')], {}))
  t.end()
})

test('forbidden/reflection access should be blocked', async (t) => {
  function run (program) {
    return parse(JSON.stringify(program))
  }

  t.test('cannot access constructor via ref', (t) => {
    // try to reach the constructor of nested.again.T
    t.throws(() => run(['ref', 'nested', 'again', 'T', 'constructor']))
    t.end()
  })

  t.test('cannot access prototype property', (t) => {
    // direct prototype traversal attempt
    t.throws(() => run(['ref', 'nested', '__proto__']))
    t.throws(() => run(['ref', 'nested', 'again', '__proto__']))
    t.end()
  })

  t.test('cannot reach Function constructor', (t) => {
    // many modules may accidentally expose Function; this should not be available via ref
    t.throws(() => run(['ref', 'Function']))
    t.end()
  })

  t.test('cannot call Function to execute code', (t) => {
    // If Function were reachable, this would execute arbitrary code
    const program = ['call', ['ref', 'Function'], [['leaf', '"return 1 + 2"']]]
    t.throws(() => run(program))
    t.end()
  })

  t.test('cannot access global Promise constructor via ref', (t) => {
    t.throws(() => run(['ref', 'Promise', 'prototype', 'then']))
    t.end()
  })

  t.test('cannot access Object.prototype methods', (t) => {
    // toString is a common vector for prototype access
    t.throws(() => run(['ref', 'toString']))
    t.throws(() => run(['ref', 'nested', 'again', 'T', 'toString']))
    t.end()
  })

  t.test('cannot reach process or global (if accidentally exposed)', (t) => {
    // attempt common global names; parser should not resolve them
    t.throws(() => run(['ref', 'process']))
    t.throws(() => run(['ref', 'global']))
    t.end()
  })

  t.test('cannot use constructor.constructor to reach Function', (t) => {
    // attempt: nested.again.T.constructor.constructor
    t.throws(() => run(['ref', 'nested', 'again', 'T', 'constructor', 'constructor']))
    t.end()
  })

  t.test('throws when trying to get something that does not exist', (t) => {
    // Ensure array that contains a ref-like array stays as data if not a SendScript ref wrapper:
    t.throws(() => run(['ref', 'doesNotExist']))
    t.end()
  })

  t.end()
})
