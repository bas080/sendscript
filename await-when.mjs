import curry from './curry.mjs'

export default curry(function awaitWhen (when, array) {
  return array.reduce(async (asyncAcc, item) => {
    const acc = await asyncAcc

    acc.push(when(item) ? await item : item)

    return acc
  }, [])
})
