// ./example/client.socket.io.mjs

import socketClient from 'socket.io-client'
import dsl from '../dsl.mjs'

const port = process.env.PORT || 3000
const client = socketClient(`http://localhost:${port}`)

const exec = program => {
  return new Promise((resolve, reject) => {
    client.emit('message', program, (error, result) => {
      error
        ? reject(error)
        : resolve(result)
    })
  })
}

const { add, square } = dsl(['add', 'square'], exec)

console.log(
  await square(add(1, add(add(2, 3), 4)))
)

process.exit(0)
