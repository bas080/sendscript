/**
 * Client-side usage with type-safe SendScript
 */

import math from './math.client.ts'
import Stringify from 'sendscript/stringify.ts'

const stringify = Stringify()

/**
 * Send a SendScript program to the server
 * 
 * TypeScript knows that the return type matches the program's return type.
 * In this case, square(add(1, 2)) returns a number, so T is number.
 */
async function send<T>(program: T): Promise<T> {
  return (await (await fetch('/api', {
    method: 'POST',
    body: stringify(program)
  })).json()) as T
}

// TypeScript provides full autocomplete for math.add and math.square
// It knows they take numbers and return numbers
//
// The explicit annotation documents the contract: this program's type is a
// number because the backend math.ts module types math.square that way
const program: number = math.square(math.add(1, 2))

const result = await send(program)
console.log(result) // 9

