import curry from './curry.mjs'

const promiseOnly = curry(function promiseOnly (when, array) {
  return array.reduce(async (asyncAcc, item) => {
    const acc = await asyncAcc

    acc.push(when(item) ? await item : item)

    return acc
  }, [])
})

export default promiseOnly
