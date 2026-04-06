import { test } from 'tap'
import curry from '../src/curry.js'

test('curry returns a function', (t) => {
  t.plan(1)
  const sumOfThree = (a: number, b: number, c: number) => a + b + c
  const curried = curry(sumOfThree)
  t.equal(typeof curried, 'function')
})

test('currying requires all arguments', (t) => {
  t.plan(2)
  const sum = (a: number, b: number) => a + b
  const curriedSum = curry(sum)
  const add5 = curriedSum(5)
  t.equal(typeof add5, 'function')
  t.equal(add5(3), 8)
})

test('curry passes through all arguments', (t) => {
  t.plan(1)
  const sumOfThree = (a: number, b: number, c: number) => a + b + c
  const curried = curry(sumOfThree)
  t.equal(curried(1, 2, 3), 6)
})

test('curry works with more arguments than needed', (t) => {
  t.plan(1)
  const sum = (a: number, b: number) => a + b
  const curriedSum = curry(sum)
  t.equal(curriedSum(1, 2, 3), 3)
})
