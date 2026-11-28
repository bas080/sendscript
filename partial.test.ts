import { test } from 'node:test'
import assert from 'node:assert'
import Partial from './partial.ts'
import { Partial as IndexPartial } from './index.ts'
import type { Schema } from './schema.ts'
import superjson from 'superjson'

test('Partial evaluation', async t => {
  const schema: Schema = [
    'add',
    'asyncAdd',
    'fail',
    ['user', ['name', 'missing', 'age']],
    ['logger', ['log']],
    ['math', ['multiply', 'pi']]
  ]

  const env = {
    add: (a: number, b: number) => a + b,
    asyncAdd: async (a: number, b: number) => a + b,
    fail: () => {
      throw new Error('boom')
    },
    user: {
      name: 'Alice',
      age: 30
    },
    logger: {
      log: (msg: string) => `logged: ${msg}`
    },
    math: {
      multiply: (a: number, b: number) => a * b,
      pi: 3.14
    }
  }

  await t.test('exports Partial from index.ts as well', () => {
    assert.strictEqual(Partial, IndexPartial)
  })

  await t.test('evaluates fully resolved programs to runtime values (done: true)', async () => {
    const partial = Partial(schema, env)

    const result = await partial(JSON.stringify({
      name: ['ref', 'user', 'name'],
      sum: ['call', ['ref', 'add'], [['leaf', '10'], ['leaf', '20']]],
      pi: ['ref', 'math', 'pi']
    }))

    assert.strictEqual(result.done, true)
    assert.deepStrictEqual(result.partial, {
      name: 'Alice',
      sum: 30,
      pi: 3.14
    })
  })

  await t.test('resolves async operations when complete', async () => {
    const partial = Partial(schema, env)

    const result = await partial(JSON.stringify([
      'await',
      ['call', ['ref', 'asyncAdd'], [['leaf', '5'], ['leaf', '15']]]
    ]))

    assert.strictEqual(result.done, true)
    assert.strictEqual(result.partial, 20)
  })

  await t.test('preserves unresolved references and serializes evaluated branches (done: false)', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify({
      a: ['ref', 'user', 'name'],
      b: ['ref', 'user', 'missing'],
      c: ['ref', 'logger', 'log']
    })

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, {
      a: ['leaf', '"Alice"'],
      b: ['ref', 'user', 'missing'],
      c: ['ref', 'logger', 'log']
    })
  })

  await t.test('resuming evaluation across multiple stages', async () => {
    const initialEnv = {
      user: {
        name: 'Alice'
      },
      logger: {
        log: (msg: string) => msg
      }
    }

    const first = await Partial(schema, initialEnv)(JSON.stringify({
      a: ['ref', 'user', 'name'],
      b: ['ref', 'user', 'missing'],
      c: ['ref', 'logger', 'log']
    }))

    assert.strictEqual(first.done, false)
    assert.deepStrictEqual(first.partial, {
      a: ['leaf', '"Alice"'],
      b: ['ref', 'user', 'missing'],
      c: ['ref', 'logger', 'log']
    })

    const updatedEnv = {
      ...initialEnv,
      user: {
        ...initialEnv.user,
        missing: 'Bob'
      }
    }

    const second = await Partial(schema, updatedEnv)(JSON.stringify(first.partial))

    assert.strictEqual(second.done, true)
    assert.deepStrictEqual(second.partial, {
      a: 'Alice',
      b: 'Bob',
      c: initialEnv.logger.log
    })
  })

  await t.test('evaluates synchronously when program has no awaits (matching Parse)', () => {
    const partial = Partial(schema, env)

    // Synchronous completed evaluation
    const syncDone = partial(JSON.stringify({
      name: ['ref', 'user', 'name'],
      sum: ['call', ['ref', 'add'], [['leaf', '1'], ['leaf', '2']]]
    }))

    assert.strictEqual(syncDone instanceof Promise, false)
    assert.strictEqual(syncDone.done, true)
    assert.deepStrictEqual(syncDone.partial, {
      name: 'Alice',
      sum: 3
    })

    // Synchronous incomplete evaluation
    const syncPartial = partial(JSON.stringify({
      name: ['ref', 'user', 'name'],
      missing: ['ref', 'user', 'missing']
    }))

    assert.strictEqual(syncPartial instanceof Promise, false)
    assert.strictEqual(syncPartial.done, false)
    assert.deepStrictEqual(syncPartial.partial, {
      name: ['leaf', '"Alice"'],
      missing: ['ref', 'user', 'missing']
    })
  })

  await t.test('returns Promise when program contains await', async () => {
    const partial = Partial(schema, env)

    const asyncReturn = partial(JSON.stringify([
      'await',
      ['call', ['ref', 'asyncAdd'], [['leaf', '2'], ['leaf', '3']]]
    ]))

    assert.strictEqual(asyncReturn instanceof Promise, true)
    const result = await asyncReturn
    assert.strictEqual(result.done, true)
    assert.strictEqual(result.partial, 5)
  })

  await t.test('partially evaluates call expressions with unresolved operands', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'call',
      ['ref', 'add'],
      [['leaf', '1'], ['ref', 'user', 'missing']]
    ])

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, [
      'call',
      ['ref', 'add'],
      [['leaf', '1'], ['ref', 'user', 'missing']]
    ])
  })

  await t.test('partially evaluates awaits with unresolved inner expression', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'await',
      ['ref', 'user', 'missing']
    ])

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, [
      'await',
      ['ref', 'user', 'missing']
    ])
  })

  await t.test('partially evaluates then with unresolved target', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'then',
      ['ref', 'user', 'missing'],
      ['ref', 'logger', 'log'],
      null
    ])

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, [
      'then',
      ['ref', 'user', 'missing'],
      ['ref', 'logger', 'log'],
      null
    ])
  })

  await t.test('preserves uncalled fn with unresolvable references', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'fn',
      ['x'],
      ['call', ['ref', 'user', 'missing'], [['arg', 'x']]]
    ])

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, [
      'fn',
      ['x'],
      ['call', ['ref', 'user', 'missing'], [['arg', 'x']]]
    ])
  })

  await t.test('executes fn when called in program', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'call',
      ['fn', ['x'], ['call', ['ref', 'add'], [['arg', 'x'], ['leaf', '10']]]],
      [['leaf', '5']]
    ])

    const result = await partial(program)

    assert.strictEqual(result.done, true)
    assert.strictEqual(result.partial, 15)
  })

  await t.test('propagates non-reference errors', async () => {
    const partial = Partial(schema, env)

    const program = JSON.stringify([
      'call',
      ['ref', 'fail'],
      []
    ])

    await assert.rejects(async () => {
      await partial(program)
    }, /boom/)
  })

  await t.test('supports custom leaf serializers/deserializers', async () => {
    const leafParse = (str: string) => superjson.parse(str)
    const leafStringify = (val: unknown) => superjson.stringify(val)

    const partial = Partial(schema, env, leafParse, leafStringify)

    const date = new Date('2026-11-28T00:00:00.000Z')
    const program = JSON.stringify({
      now: ['leaf', superjson.stringify(date)],
      missing: ['ref', 'user', 'missing']
    })

    const result = await partial(program)

    assert.strictEqual(result.done, false)
    assert.deepStrictEqual(result.partial, {
      now: ['leaf', superjson.stringify(date)],
      missing: ['ref', 'user', 'missing']
    })

    const resumeEnv = {
      ...env,
      user: {
        ...env.user,
        missing: 'here'
      }
    }

    const resumed = await Partial(schema, resumeEnv, leafParse, leafStringify)(JSON.stringify(result.partial))

    assert.strictEqual(resumed.done, true)
    assert.deepStrictEqual(resumed.partial, {
      now: date,
      missing: 'here'
    })
  })
})
