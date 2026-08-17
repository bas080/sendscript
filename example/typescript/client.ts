/**
 * Client-side usage with type-safe SendScript
 */

import math from './math.client.ts'
import Stringify from 'sendscript/stringify.mjs'

const stringify = Stringify()

/**
 * Send a SendScript program to the server
 * 
 * TypeScript knows that the return type matches the program's return type.
 * In this case, square(add(1, 2)) returns a number, so T is number.
 */
async function send<T>(program: T): Promise<T> {
  return (await fetch('/api', {
    method: 'POST',
    body: stringify(program)
  })).json()
}

// TypeScript provides full autocomplete for math.add and math.square
// It knows they take numbers and return numbers
const result = await send(math.square(math.add(1, 2)))
console.log(result) // 9

