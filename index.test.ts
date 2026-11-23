import { test } from 'node:test'
import assert from 'node:assert'
import Stringify from './stringify.ts'
import references from './references.ts'
import Parse from './parse.ts'
import { SendScriptReferenceError, SendScriptSerializationError } from './error.ts'
import type { Schema } from './schema.ts'

const order: string[] = []

const myModuleOrig = {
  nested: {
    again: {
      T: () => true
    }
  },
  add: (a: number, b: number) => a + b,
  identity: (x: unknown) => x,
  concat: (a: unknown[], b: unknown[]) => a.concat(b),
  delay: (value: string, ms: number) => {
    return new Promise<string>(resolve => {
      order.push(`${value} start`)
      setTimeout(() => {
        order.push(`${value} end`)

        resolve(value)
      }, ms)
    })
  },
  toArray: (...array: unknown[]) => array,
  always: (x: unknown) => () => x,
  multiply3: (a: number) => (b: number) => (c: number) => a * b * c,
  sayHello: (x: unknown) => `hello ${x}`,
  map: (fn: unknown) => (array: unknown[]) => array.map(fn as any),
  filter: (pred: unknown) => (array: unknown[]) => array.filter(pred as any),
  hello: 'world',
  noop: () => {},
  resolve: (x: unknown) => Promise.resolve(x),
  call: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
  reject: (x: unknown) => Promise.reject(x),
  asyncFn: async () => 'my-async-function',
  instanceOf: (x: unknown, t: unknown) => x instanceof (t as any),
  asyncAdd: async (a: number, b: number) => a + b,
  aPromise: Promise.resolve(42),
  delayedIdentity: async (x: unknown) => x,
  nullProto: () => {
    const obj: any = Object.create(null)
    obj.b = 'c'
    return obj
  },
  Promise
}

// We want to support prototype chain when parsing.
const myModule = Object.create(myModuleOrig)
const schema = Object.keys(myModuleOrig) as Schema

schema.push(['nested', [
  ['again', ['T']]
]])

const api = references(schema)
const stringify = Stringify()
const parse = Parse(schema, myModule)

const run = (program: unknown) => parse(stringify(program))

const RealPromise = Promise

test('should evaluate basic expressions correctly', async t => {
  const {
    aPromise,
    asyncAdd,
    resolve,
    reject,
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
    sayHello,
    call,
    nested
  } = api as any

  await t.test('throws when async fn is provided', async () => {
    assert.throws(() => run(identity(async () => {})))
  })

  await t.test('supports fns with arguments', async () => {
    assert.deepEqual(run(map((a: unknown) => add(a, 1))([1, 2, 3])), [2, 3, 4])
  })

  await t.test('nested fns with arguments', async () => {
    assert.deepEqual(run(
      map(call)(
        map((a: unknown) => () => add(a, 1))([1, 2, 3])
      )), [2, 3, 4])
  })

  await t.test('supports fns without arguments', async () => {
    assert.equal((run(() => add(1, 2)) as () => unknown)(), 3)
    assert.equal(run(always(() => 42)()()), 42)
    assert.equal(run(always((x: unknown) => add(x, 42))()(2)), 44)
  })

  await t.test('supports binding reference functions on client', async () => {
    const plusOne = add.bind(null, 1)

    assert.equal(run(plusOne(1)), 2)
    assert.equal(await run(resolve(1).then(plusOne)), 2)

    // Even this works.
    assert.equal(await run(resolve(1).then((v: unknown) => plusOne(v))), 2)
  })

  await t.test('supports .then', async () => {
    const something = 30

    await assert.rejects(run(reject('error')) as Promise<unknown>)

    assert.equal(await run(reject('error').catch(sayHello)), 'hello error')
    assert.equal(await run(reject('error').then(null, sayHello)), 'hello error')

    // .then with fns just works and I do not know why.
    assert.equal(await run(resolve(32).then(() => add(something, 1))), 31)
    assert.equal(await run(resolve(32).then((value: unknown) => add(something, value))), 62)

    assert.equal(await run(resolve('value').then(sayHello)), 'hello value')
    assert.equal(await run(resolve('value').then(sayHello, noop)), 'hello value')
  })

  await t.test('resolve and reject callback works for .then', async () => {
    assert.equal(await run(resolve(42).then(multiply3(1)(2))), 84)
  })

  await t.test('await evaluation order matches JS semantics', async () => {
    const lorder: string[] = []

    const ldelay = (label: string, ms: number) => new RealPromise<string>((resolve) => {
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

    assert.deepEqual(lresult, ['a', 'b'])
    assert.deepEqual(lorder, [
      'a start',
      'a end',
      'b start',
      'b end'
    ])

    const result = await run([
      await delay('a', 30),
      await delay('b', 10)
    ])

    assert.deepEqual(result, ['a', 'b'])
    assert.deepEqual(order, [
      'a start',
      'a end',
      'b start',
      'b end'
    ])
  })

  await t.test('mix await without await', async () => {
    const [one, two] = (await run([await resolve(1), resolve(2)])) as unknown[]

    assert.equal(one, 1)
    assert.ok(two instanceof RealPromise)
  })

  await t.test('calling nested function works', () => {
    assert.equal(run(nested.again.T()), true)
  })

  await t.test('nested await works', async () => {
    // Async identity passthrough
    const resolvedId = await delayedIdentity

    assert.equal(await run(resolvedId('X')), 'X')
  })

  await t.test('deep nested awaits', async () => {
    const nested = async () => await RealPromise.resolve(await delayedIdentity('deep'))
    assert.equal(await run(await nested()), 'deep')
  })

  await t.test('awaits in nested array structure', async () => {
    const arr = [
      await resolve(1),
      [await resolve(2), [await resolve(3)]],
      await delayedIdentity(4)
    ]
    assert.deepEqual(await run(arr), [1, [2, [3]], 4])
  })

  await t.test('awaits in deeply nested object structure', async () => {
    const obj = {
      a: await resolve('a'),
      b: {
        c: await delayedIdentity('c'),
        d: {
          e: await resolve('e')
        }
      }
    }
    assert.deepEqual(await run(obj), {
      a: 'a',
      b: {
        c: 'c',
        d: { e: 'e' }
      }
    })
  })

  await t.test('await as computed value inside nested async function', async () => {
    const asyncOuter = async () => {
      const val = await delayedIdentity('nested')
      return val
    }
    assert.equal(await run(await asyncOuter()), 'nested')
  })

  await t.test('promise resolution', async () => {
    assert.equal(await run(identity(await aPromise)), 42)
    assert.deepStrictEqual(await run(asyncFn()), 'my-async-function')
    assert.deepStrictEqual(await run(await resolve('my-promise')), 'my-promise')
    assert.deepStrictEqual(run(instanceOf(resolve(asyncFn), Promise)), true)
    assert.deepStrictEqual(
      await run({ a: await resolve('b') }),
      { a: 'b' }
    )
  })

  await t.test('async and promise handling', async () => {
    // Await inside run input
    const resolvedAdd = await RealPromise.resolve(asyncAdd)
    assert.equal(await run(resolvedAdd(2, 3)), 5)

    // Using asyncFn in a nested structure
    const nestedAsync = async () => await asyncFn()
    assert.equal(await run(await nestedAsync()), 'my-async-function')

    // Awaiting inside object structure
    assert.deepEqual(await run({
      type: 'response',
      data: await resolve('some-data')
    }), {
      type: 'response',
      data: 'some-data'
    })
  })

  await t.test('throws if stringify returns undefined', () => {
    // This is to prevent accidentally sending payloads that make little sense.

    // Check if it throw the expected error type.
    try {
      run(undefined)
    } catch (error) {
      assert.ok(error instanceof SendScriptSerializationError)
    }

    assert.throws(() => run(undefined))
    assert.throws(() => run(new Set()))
    assert.throws(() => run(identity(undefined)))
    assert.throws(() => run(() => {}))
  })

  await t.test('basic types and identity', () => {
    assert.equal(run(identity(null)), null)
    assert.equal(run(noop()), undefined)
    assert.equal(run(identity(1)), 1)
    assert.deepStrictEqual(run(identity([])), [])
    assert.deepStrictEqual(run(identity({})), {})
    assert.deepStrictEqual(run(identity([identity(1), 2, 3])), [1, 2, 3])
    assert.deepStrictEqual(run(always('hello')()), 'hello')
  })

  await t.test('objects and arrays', () => {
    assert.deepStrictEqual(
      run(identity({ a: identity(1), b: always(2)(), c: add(1, 2) })),
      { a: 1, b: 2, c: 3 }
    )
    assert.deepStrictEqual(run(concat([1, 2], [[add(1, 2)]])), [1, 2, [3]])
    assert.deepStrictEqual(run(concat([1, 2], [add(1, 2), add(2, 2)])), [1, 2, 3, 4])
    assert.deepStrictEqual(run(map(identity)([1, 2, 3, 4])), [1, 2, 3, 4])
  })

  await t.test('function composition and currying', () => {
    assert.deepStrictEqual(run(multiply3(1)(2)(3)), 6)
  })

  await t.test('special cases and errors', () => {
    assert.throws(() => parse('["ref", "notDefined"]'))
    assert.deepStrictEqual(
      run(identity(['ref', 'doesNotExist'])),
      ['ref', 'doesNotExist']
    )
    assert.deepStrictEqual(
      run(identity(['ref', 'hello'])),
      run(identity(toArray('ref', 'hello')))
    )
    assert.deepStrictEqual(
      run(identity(['leaf', 1, 2, 3])),
      ['leaf', 1, 2, 3]
    )
  })

  await t.test('null-prototype object traversal', () => {
    const { nullProto } = api as any
    const other = myModule.nullProto()
    assert.deepStrictEqual(run({ a: nullProto() }), { a: other })
  })

  await t.test('primitives and built-ins', () => {
    assert.equal(JSON.stringify([undefined]), '[null]')
    assert.equal(run(hello), 'world')
    assert.equal(run(add(1, 2)), 3)
  })

  await t.test('identity with arrays', () => {
    assert.deepStrictEqual(
      run(identity([identity(1), identity(2), identity(3), identity(4)])),
      [1, 2, 3, 4]
    )
  })
})

test('stringify: invalid children throws', () => {
  const invalidSchema = [
    ['math', 'add']
  ] as unknown as Schema

  assert.throws(() => Parse(invalidSchema, {}))
  assert.throws(() => Parse([Symbol('no-allowed')] as unknown as Schema, {}))
})

test('forbidden/reflection access should be blocked', async t => {
  function run (program: unknown) {
    return parse(JSON.stringify(program))
  }

  await t.test('cannot access constructor via ref', () => {
    // try to reach the constructor of nested.again.T
    assert.throws(() => run(['ref', 'nested', 'again', 'T', 'constructor']))
  })

  await t.test('cannot access prototype property', () => {
    // direct prototype traversal attempt
    assert.throws(() => run(['ref', 'nested', '__proto__']))
    assert.throws(() => run(['ref', 'nested', 'again', '__proto__']))
  })

  await t.test('cannot reach Function constructor', () => {
    // many modules may accidentally expose Function; this should not be available via ref
    assert.throws(() => run(['ref', 'Function']))
  })

  await t.test('cannot call Function to execute code', () => {
    // If Function were reachable, this would execute arbitrary code
    const program = ['call', ['ref', 'Function'], [['leaf', '"return 1 + 2"']]]
    assert.throws(() => run(program))
  })

  await t.test('cannot access global Promise constructor via ref', () => {
    assert.throws(() => run(['ref', 'Promise', 'prototype', 'then']))
  })

  await t.test('cannot access Object.prototype methods', () => {
    // toString is a common vector for prototype access
    assert.throws(() => run(['ref', 'toString']))
    assert.throws(() => run(['ref', 'nested', 'again', 'T', 'toString']))
  })

  await t.test('cannot reach process or global (if accidentally exposed)', () => {
    // attempt common global names; parser should not resolve them
    assert.throws(() => run(['ref', 'process']))
    assert.throws(() => run(['ref', 'global']))
  })

  await t.test('cannot use constructor.constructor to reach Function', () => {
    // attempt: nested.again.T.constructor.constructor
    assert.throws(() => run(['ref', 'nested', 'again', 'T', 'constructor', 'constructor']))
  })

  await t.test('throws when trying to get something that does not exist', () => {
    // Ensure array that contains a ref-like array stays as data if not a SendScript ref wrapper:
    assert.throws(() => run(['ref', 'doesNotExist']))
  })
})

test('__proto__ is a reserved arg name in fn/arg', async t => {
  function run (program: unknown) {
    return parse(JSON.stringify(program))
  }

  await t.test('fn cannot bind a parameter named __proto__', () => {
    assert.throws(() => run(['fn', ['__proto__'], 42]))
  })

  await t.test('fn cannot bind __proto__ when invoked through call', () => {
    assert.throws(() => run(['call', ['fn', ['__proto__'], ['arg', 'x']], [['leaf', '"1"']]]))
  })

  await t.test('fn cannot bind __proto__ to non-object values either', () => {
    assert.throws(() => run(['call', ['fn', ['__proto__'], 42], [1]]))
  })

  await t.test('arg cannot read __proto__', () => {
    assert.throws(() => run(['arg', '__proto__']))
  })
})

test('constructor and prototype names behave for users', async t => {
  const myEnv = {
    constructor: () => 'ctor-value',
    prototype: () => 'proto-value',
    add: (a: number, b: number) => a + b
  }

  const localParse = Parse(['constructor', 'prototype', 'add'], myEnv)

  function run (program: unknown) {
    return localParse(JSON.stringify(program))
  }

  await t.test('env may export functions named constructor and prototype', () => {
    assert.strictEqual(run(['call', ['ref', 'constructor'], []]), 'ctor-value')
    assert.strictEqual(run(['call', ['ref', 'prototype'], []]), 'proto-value')
  })

  await t.test('constructor and prototype are fine as fn parameter names', () => {
    assert.strictEqual(
      run(['call', ['fn', ['constructor', 'prototype'], ['arg', 'constructor']], ['a', 'b']]),
      'a'
    )
    assert.strictEqual(
      run(['call', ['fn', ['constructor', 'prototype'], ['arg', 'prototype']], ['a', 'b']]),
      'b'
    )
  })

  await t.test('using constructor/prototype as fn parameters pollutes nothing', () => {
    run(['call', ['fn', ['constructor', 'prototype'], 42], ['a', 'b']])

    assert.strictEqual(({} as any).prototype, undefined)
    assert.strictEqual(({}).constructor, Object)
  })

  await t.test('arg cannot reach module env members', () => {
    assert.strictEqual(parse(JSON.stringify(['arg', 'add'])), undefined)
  })

  await t.test('ref of constructor/prototype not in the schema throws', () => {
    const plainParse = Parse(['add'], myEnv)

    assert.throws(() => plainParse(JSON.stringify(['ref', 'constructor'])), SendScriptReferenceError)
    assert.throws(() => plainParse(JSON.stringify(['ref', 'prototype'])), SendScriptReferenceError)
  })
})
