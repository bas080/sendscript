# Code on Demand

The previous chapters treat SendScript as [remote evaluation][rev]: the client
ships a program over the wire, the server executes it and answers with a value.
This chapter describes the reverse move, known in distributed systems as [code
on demand][cod] — the server does not answer with a value, it answers with
_another SendScript program_ that the client runs locally to obtain the final
result.

Because both sides of the wire speak the program language documented in
[SENDSCRIPT][sendscript], no extra machinery is required. `Parse` runs on the
client just as well as it runs on the server, only with its own schema listing
the callbacks the client is willing to resolve.

One consequence of answering with a program is that the server decides _how_ the
result is delivered while the client decides _what the delivery means_. The
example below exploits exactly that for error handling. The response program
calls a single callback — [continuation-passing style][cps] — one for the error
case and one for the success case, so the client never needs a try/catch around
the wire.

## Example

A server module that can fail:

```js
export const divide = (a: number, b: number): number => {
  if (b === 0) throw new Error('division by zero')

  return a / b
}
```

The client asks the server to evaluate a program. As before, the program is
written as ordinary JavaScript on the client:

```js
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'

const { divide } = references(['divide'])
const stringify = Stringify()

console.log(stringify(divide(4, 2)))
```
```json
["call",["ref","divide"],[["leaf","4"],["leaf","2"]]]
```

Instead of answering with `2`, the server answers with a program. The program
names one of two client-side continuations — `resolved` when the call succeeded,
`rejected` when it threw:

```js
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'

const { resolved, rejected } = references(['resolved', 'rejected'])
const stringify = Stringify()

console.log(stringify(resolved(2)))

console.log(stringify(rejected('division by zero')))
```
```json
["call",["ref","resolved"],[["leaf","2"]]]
["call",["ref","rejected"],[["leaf","\"division by zero\""]]]
```

The server picks the branch by running the incoming program in an async function
and wrapping `parse` in a try/catch:

```js
import Parse from 'sendscript/parse.ts'
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'
import * as api from './module.ts'

const { resolved, rejected } = references(['resolved', 'rejected'])
const stringify = Stringify()
const parse = Parse(['divide'], api)

export default async function handle (program: string): Promise<string> {
  try {
    return stringify(resolved(await parse(program)))
  } catch (error) {
    return stringify(rejected((error as Error).message))
  }
}
```

The client resolves the program the server returned against its own environment
— the two callbacks:

```js
import handle from './server.ts'
import Parse from 'sendscript/parse.ts'
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'

const { divide } = references(['divide'])
const stringify = Stringify()

const parse = Parse(['resolved', 'rejected'], {
  resolved: (value: number) => console.log('resolved with', value),
  rejected: (message: string) => console.log('rejected with', message)
})

const send = async (program: unknown) =>
  parse(await handle(stringify(program)))

await send(divide(4, 2))

await send(divide(1, 0))
```

```bash
node ./example/reactive/client.ts
```
```
resolved with 2
rejected with division by zero
```

## Trust

Answering with code trades visibility for flexibility: the client ends up
running programs the server chose, and any buffer between them — logging,
caching, inspection — sees a program instead of a plain value. The schema keeps
this honest in both directions. Only names declared in the client schema resolve
to the client's callbacks and anything else throws a SendScriptReferenceError,
so a hostile or buggy server can at most call the continuations you declared,
with the arguments it serialized.

Keep client environments small and side-effect free. A continuation that returns
still another program makes the loop reactive — the server can keep handing work
back to the client — but looping programs are easiest to reason about when every
round trip passes through one small, typed entry point.

[rev]: https://en.wikipedia.org/wiki/Remote_evaluation
[cod]: https://en.wikipedia.org/wiki/Code_on_demand
[cps]: https://en.wikipedia.org/wiki/Continuation-passing_style
[sendscript]: ./SENDSCRIPT.md
