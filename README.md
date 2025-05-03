# SendScript

Write JS code that you can run on servers, browsers or other clients.

[![NPM](https://img.shields.io/npm/v/sendscript?color=blue&style=flat-square)](https://www.npmjs.com/package/sendscript)
[![100% Code Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](#tests)
[![Standard Code Style](https://img.shields.io/badge/code_style-standard-brightgreen.svg?style=flat-square)](https://standardjs.com)
[![License](https://img.shields.io/npm/l/sendscript?color=brightgreen&style=flat-square)](./LICENSE.txt)

<!-- toc -->

- [Socket example](#socket-example)
  * [Module](#module)
  * [Server](#server)
  * [Client](#client)
- [Async/Await](#asyncawait)
- [TypeScript](#typescript)
- [Tests](#tests)
- [Formatting](#formatting)
- [Changelog](#changelog)
- [Dependencies](#dependencies)
- [License](#license)
- [Roadmap](#roadmap)

<!-- tocstop -->

SendScript leaves it up to you to choose HTTP, web-sockets or any other
method of communication between servers and clients that best fits your
needs.

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
import Parse from '../parse.mjs'
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
```

### Client

Now for a client that sends a program to the server.

```js
// ./example/client.socket.io.mjs

import socketClient from 'socket.io-client'
import stringify from '../stringify.mjs'
import module from '../module.mjs'
import * as math from './math.mjs'
import assert from 'node:assert'

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

const { add, square } = module(math)

// The program to be sent over the wire
const program = square(add(1, add(add(2, 3), 4)))

const result = await send(program)

console.log('Result: ', result)

assert.equal(result, 100)

process.exit(0)
```

Now we run this server and a client script.

```bash
set -e

# Run the server
node ./example/server.socket.io.mjs&

# Run the client example
node ./example/client.socket.io.mjs

pkill sendscript
```
```
Result:  100
```

## Async/Await

SendScript supports async/await seamlessly within a single request. This avoids the performance pitfalls of waterfall-style messaging, which can be especially slow on high-latency networks.

While it's possible to chain promises manually or use utility functions, native async/await support makes your code more readable, modern, and easier to reason about — aligning SendScript with today’s JavaScript best practices.

```js
const userId = 'user-123'
const program = {
  unread: await fetchUnreadMessages(userId),
  emptyTrash: await emptyTrash(userId),
  archived: await archiveMessages(selectMessages({ old: true }))
}

const result = await send(program)
```

This operation is done in a single round-trip. The result is an object with the defined properties and returned values.

## TypeScript

There is a good use-case to write a module in TypeScript.

1. Obviously the module would have the benefits that TypeScript offers when
   coding.
2. You can use tools like [typedoc][typedoc] to generate docs from your types to
   share with consumers of your API.
3. You can use the types of the module to coerce your client to adopt the
   module's type.

```ts
import type * as math from './example/math.ts'

import module from 'sendscript/module.mjs'

export default module([
  add,
  squer,
]) as typeof math
```

> [!NOTE]
> Although type coercion on the client side can improve the development
> experience, it does not represent the actual type.
> Values are subject to serialization and deserialization.

## Tests

Tests with 100% code coverage.

```bash
npm t -- -R silent
npm t -- report text-summary
```
```

> sendscript@1.0.1 test
> tap -R silent


> sendscript@1.0.1 test
> tap report text-summary


=============================== Coverage summary ===============================
Statements   : 100% ( 239/239 )
Branches     : 100% ( 71/71 )
Functions    : 100% ( 18/18 )
Lines        : 100% ( 239/239 )
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

## Roadmap

- [ ] Support for simple lambdas to compose functions more easily.

[license]:./LICENSE.txt
[socket.io]:https://socket.io/
[changelog]:./CHANGELOG.md
[auto-changelog]:https://www.npmjs.com/package/auto-changelog
[typedoc]:https://github.com/TypeStrong/typedoc
