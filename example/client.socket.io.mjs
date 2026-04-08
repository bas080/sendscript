// ./example/client.socket.io.mjs

import socketClient from 'socket.io-client'
import Stringify from 'sendscript/stringify.mjs'
import references from 'sendscript/references.mjs'
import assert from 'node:assert'

const { add, square } = references(['add', 'square'])
const stringify = Stringify()

const port = process.env.PORT || 3000
const client = socketClient(`http://localhost:${port}`)

const send = program => {
  return new Promise((resolve, reject) => {
    client.emit('message', stringify(program), (error, result) => {
      error
        ? reject(error)
        : resolve(result)
    })
  })
}

// The program to be sent over the wire
const program = square(add(1, add(add(2, 3), 4)))

const result = await send(program)

console.log('Result: ', result)

assert.equal(result, 100)

process.exit(0)
