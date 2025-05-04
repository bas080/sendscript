import stringify from 'sendscript/stringify.mjs'

async function send<T>(program: T): Promise<T>{
  return (await fetch('/api', {
    method: 'POST',
    body: stringify(program)
  })).json()
}

import math from './math.client.ts'

const { add, square } = math

send(square(add(1, 2)))
