import { test } from 'tap'
import { exec } from './exec.mjs'

test('should evaluate basic expressions correctly', (t) => {
  t.plan(4)

  exec({ '+': (a, b) => a + b }, ['+', 1, 2])
    .then((result) => t.equal(result, 3, '1 + 2 = 3'))

  exec({ '-': (a, b) => a - b }, ['-', 5, 3])
    .then((result) => t.equal(result, 2, '5 - 3 = 2'))

  exec({ '*': (a, b) => a * b }, ['*', 4, 3])
    .then((result) => t.equal(result, 12, '4 * 3 = 12'))

  exec({ '/': (a, b) => a / b }, ['/', 10, 2])
    .then((result) => t.equal(result, 5, '10 / 2 = 5'))
})

test('should be able to call a partially applied function', async t => {
  const env = {
    '+': a => b => a + b
  }

  t.equal(typeof (await exec(env, ['+', 1])), 'function')
  t.equal(await exec(env, [['+', 1], 2]), 3)
  t.end()
})

test('should handle let expressions', (t) => {
  t.plan(1)

  exec({ '+': (a, b) => a + b }, ['let', [['x', 2], ['y', 3]], ['+', ['x'], ['y']]])
    .then((result) => t.equal(result, 5, 'x + y = 5'))
})

test('should handle fn expressions', (t) => {
  t.plan(2)

  exec({}, ['fn', ['+', 1, 'x']])
    .then((result) => t.equal(typeof result, 'function', 'should return a function'))

  exec({ '+': (a, b) => a + b }, ['fn', ['+', 1, ['x']]])
    .then(async (result) => {
      t.equal(await result({ x: 2 }), 3, '1 + 2 = 3')
    })
})

test('should throw an error for unknown expressions', (t) => {
  t.plan(1)

  exec({ '+': (a, b) => a + b }, ['-', 1, 2])
    .catch((err) => t.equal(err.message, 'Unknown expression: -', 'should throw an error for unknown expressions'))
})

test('should evaluate nested expressions correctly', (t) => {
  t.plan(1)

  const env = {
    '+': (a, b) => a + b,
    '*': (a, b) => a * b
  }

  exec(env, ['*', 2, ['+', 1, 2]])
    .then((result) => t.equal(result, 6, '2 * (1 + 2) = 6'))
})

test('should concatenate two arrays', async t => {
  t.plan(1)

  const env = {
    array: (...args) => args,
    concat: (a, b) => a.concat(b)
  }
  const expression = ['concat', ['array', 1, 2, 3], ['array', 4, 5, 6]]
  const result = await exec(env, expression)

  t.same(result, [1, 2, 3, 4, 5, 6])
})

test('should fetch the reference to the item on the env', async t => {
  const value = 'yey'

  const env = {
    thing: () => value
  }

  const expression = ['ref', 'thing']
  const result = await exec(env, expression)

  t.same(result(), value)

  const result2 = await exec(env, ['thing'])
  t.same(result2, value)

  t.end()
})

test('should reject with the error of the called function', async t => {
  const error = new Error('BOOM')
  const env = {
    throws () {
      throw error
    }
  }

  await t.rejects(exec(env, ['throws']))

  t.end()
})

test('should not exec expressions in an object', async t => {
  const env = {
    throws () {
      throw new Error('Should not have been called.')
    }
  }

  const result = await exec(env, { quoted: ['throws'] })

  t.same(result, {
    quoted: ['throws']
  })
  t.end()
})
