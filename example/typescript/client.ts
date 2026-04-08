import math  from './math.client.ts'
import Stringify from 'sendscript/stringify.mjs'

const stringify = Stringify()

// The return type of this function matches the type passed as the return of the program.
async function send<T>(program: T): Promise<T> {
  return (await fetch('/api', {
    method: 'POST',
    body: stringify(program)
  })).json()
}

send(square(add(1, 2)))
