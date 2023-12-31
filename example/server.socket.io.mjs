// ./example/server.socket.io.mjs

import { Server } from 'socket.io'
import exec from '../exec.mjs'
import * as math from './math.mjs'

const server = new Server()
const port = process.env.PORT || 3000

server.on('connection', (socket) => {
  socket.on('message', async (program, callback) => {
    try {
      const result = await exec(math, program)
      callback(null, result) // Pass null as the first argument to indicate success
    } catch (error) {
      callback(error) // Pass the error to the callback
    }
  })
})

server.listen(port)
process.title = 'sendscript'
