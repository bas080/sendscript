// ./example/server.socket.io.mjs

import { Server } from 'socket.io'
import Parse from 'sendscript/parse.mjs'
import * as math from './math.mjs'

const parse = Parse(math)
const server = new Server()
const port = process.env.PORT || 3000

server.on('connection', (socket) => {
  socket.on('message', async (program, callback) => {
    try {
      const result = parse(program)
      callback(null, result) // Pass null as the first argument to indicate success
    } catch (error) {
      callback(error) // Pass the error to the callback
    }
  })
})

server.listen(port)
process.title = 'sendscript'
