# SendScript

Write JS code that you can run on servers, browsers or other clients.

[![NPM](https://img.shields.io/npm/v/sendscript?color=blue&style=flat-square)](https://www.npmjs.com/package/sendscript)
[![100% Code Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](#tests)
[![Standard Code Style](https://img.shields.io/badge/code_style-standard-brightgreen.svg?style=flat-square)](https://standardjs.com)
[![License](https://img.shields.io/npm/l/sendscript?color=brightgreen&style=flat-square)](./LICENSE.txt)

> SendScript leaves it up to you to choose HTTP, web-sockets or any other
> method of communication between servers and clients that best fits your
> needs.

<!-- toc -->

- [Socket example](#socket-example)
  * [Module](#module)
  * [Server](#server)
  * [Client](#client)
- [Reference](#reference)
  * [`sendscript/api.mjs`](#sendscriptapimjs)
  * [`sendscript/exec.mjs`](#sendscriptexecmjs)
- [Tests](#tests)
- [Formatting](#formatting)
- [Changelog](#changelog)
- [Dependencies](#dependencies)
- [License](#license)

<!-- tocstop -->

## Socket example

For this example we'll use [socket.io][socket.io].

```bash
npm install --no-save socket.io socket.io-client
```

> We use the `--no-save` option because it's only for demonstration purposes.

### Module

We write a simple module.

```js
// ./example/math.mjs

export const add = (a, b) => a + b
export const square = a => a * a
```

### Server

Here a socket.io server that runs SendScript programs.

```js
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
```

### Client

Now for a client that sends a program to the server.

```js
// ./example/client.socket.io.mjs

import socketClient from 'socket.io-client'
import api from '../api.mjs'

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

const { add, square } = api(['add', 'square'], exec)

console.log(
  await square(add(1, add(add(2, 3), 4)))
)

process.exit(0)
```

Now we run this server and a client script.

```bash
# Run the server
node ./example/server.socket.io.mjs&

# Run the client example
node ./example/client.socket.io.mjs

pkill sendscript
```
```
100
```

## Reference

SendScript is essentially a way to serialize a program to then send over the
wire and execute it somewhere else.

We only have two modules. One that helps you write programs that can be sent
over the wire and another for running that program.

### `sendscript/api.mjs`

The api module exports a function that takes two arguments.

1. The schema, which represents the values that are available.
2. The function that will be called with the serializable version of the
   program.

It returns an object that contains functions which are defined in the schema.
These functions are a JavaScript API for writing programs that can be sent to
a server.

```js
import api from './api.mjs'

const  { add, subtract } = api(
  ['add', 'subtract'],
  serializableProgram => sendSomewhereToBeExecuted(serializableProgram)
)

await add(1, 2) // => 3
await subtract(1, 2) // => -1
await add(1, subtract(2, 3)) // => 0
```

The add and subtract functions are thennable. The execute function is called as
soon as await or `.then` is used.

> Notice that you do not have to await the subtract call. You only need to
> await when you want to execute the program.

This API is composable and wrappable.

### `sendscript/exec.mjs`

The exec function takes an environment object and any valid SendScript program.

```js
import exec from './exec.mjs'

exec({
  add: (a, b) => a + b,
  subtract: (a, b) => a - b
}, ['add', 1, [subtract, 1, 2]])
```

The array you see here is the LISP that SendScript uses to represent programs.

You could use SendScript without knowing the details of how the LISP works. It
is an implementation detail and might change over time.

## Tests

Tests with 100% code coverage.

```bash
npm t -- -R silent
npm t -- report text-summary
```
```

> sendscript@0.0.3 test
> tap -R silent


> sendscript@0.0.3 test
> tap report text-summary


=============================== Coverage summary ===============================
Statements   : 100% ( 139/139 )
Branches     : 100% ( 47/47 )
Functions    : 100% ( 12/12 )
Lines        : 100% ( 139/139 )
================================================================================
```

## Formatting

Standard because no config.

```bash
npx standard
```

## Changelog

The [changelog][changelog] is generated using the useful
[auto-changelog][auto-changelog] project.

```bash
npx auto-changelog -p
```

## Dependencies

Check if packages are up to date on release.

```bash
npm outdated && echo 'No outdated packages found'
```
```
No outdated packages found
```

## License

See the [LICENSE.txt][license] file for details.

[license]:./LICENSE.txt
[socket.io]:https://socket.io/
[changelog]:./CHANGELOG.md
[auto-changelog]:https://www.npmjs.com/package/auto-changelog
