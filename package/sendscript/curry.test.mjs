import { test } from 'tap'
import curry from './curry.mjs'

test('curry function', (t) => {
  t.test('curry function returns a function', (assert) => {
    const curried = curry((a, b, c) => a + b + c)
    assert.type(curried, 'function', 'returns a function')
    assert.end()
  })

  t.test('curried function returns correct result', (assert) => {
    const curried = curry((a, b, c) => a + b + c)
    const result = curried(1)(2)(3)
    assert.equal(result, 6, 'returns correct result')
    assert.end()
  })

  t.test('curried function handles partial application', (assert) => {
    const curried = curry((a, b, c) => a + b + c)
    const partial = curried(1, 2)
    const result = partial(3)
    assert.equal(result, 6, 'handles partial application')
    assert.end()
  })

  t.test('curried function handles multiple arguments', (assert) => {
    const curried = curry((a, b, c, d) => a + b + c + d)
    const partial = curried(1)
    const result = partial(2)(3, 4)
    assert.equal(result, 10, 'handles multiple arguments')
    assert.end()
  })

  t.end()
})
