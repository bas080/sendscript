# SendScript program format

A SendScript program is a plain JSON document. The client builds it with
`references` and `stringify`, sends it over any transport, and the server
evaluates it with `parse` against a real module. This document describes the
JSON exactly.

Because a program is plain JSON, support for the format can be implemented in
any language, both for clients (building and sending programs) and for servers
(evaluating them). This package is the reference implementation in
JavaScript/TypeScript; other languages only need to emit the operator nodes
documented below on the client and reproduce the evaluation model on the server.

The evaluation model has two passes:

1. The reviver pass (during `JSON.parse`) deserializes leaf text, resolves refs
   against the server module, and collects awaits.
2. The evaluation pass walks the resulting structure and runs the operators.

Everything else — plain arrays and plain objects — is a data shape that gets
evaluated in place, property by property.

The runnable examples in this document are evaluated with the script below. It
declares the schema and the vocabulary against which every `ref` in this
document resolves. Programs are evaluated by piping them into the script on
stdin, and the result is printed as JSON.

```bash
cat ./script/evalagram.ts
```
```ts
#!/usr/bin/env node

import path from 'path'
import { pathToFileURL } from 'url'
import Parse from '../parse.ts'
import type { Schema } from '../schema.ts'

const schema: Schema = [
  'add',
  'square',
  ['nested', ['square']],
  'resolve',
  'slowAdd'
]

const vocabulary = {
  add: (a: number, b: number) => a + b,
  square: (x: number) => x * x,
  nested: {
    square: (x: number) => x * x
  },
  resolve: (value: unknown) => Promise.resolve(value),
  slowAdd: (a: number, b: number) =>
    new Promise((resolve) => setTimeout(() => resolve(a + b), 10))
}

export default function evalagram (json: string): unknown {
  return Parse(schema, vocabulary)(json)
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const program = await new Promise<string>((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })

  const out = await Promise.resolve(evalagram(program))

  console.log(typeof out === 'function' ? '"[function]"' : JSON.stringify(out))
}
```

## Operators

A program is any JSON value. An array whose first element is one of the operator
keywords is interpreted as an operator node. Any other value is data.

| Operator | Shape                          | Evaluates to                  |
| -------- | ------------------------------ | ----------------------------- |
| `leaf`   | `["leaf", "<json text>"]`      | `JSON.parse`d text            |
| `ref`    | `["ref", "`segment`", ...]`    | module member at the path     |
| `call`   | `["call", <callee>, [<args>]]` | called function result        |
| `fn`     | `["fn", [<ids>], <body>]`      | closure                       |
| `arg`    | `["arg", <id>]`                | bound argument in scope       |
| `quote`  | `["quote", <value>]`           | value verbatim, not evaluated |
| `await`  | `["await", <program>]`         | resolved value of program     |
| `then`   | `["then", <v>, <h>, <h>?]`     | chained promise               |

### leaf

Leaf text is JSON stringified on the client and parsed on the server. This is
where (de)serialization of anything JSON cannot express can be customized, at
the `leafParse`/`leafStringify` hook.

```json
["leaf", "\"Hello\""]
```
```json
"Hello"
```

This evaluates to the string `Hello`. Other leaf texts: `["leaf", "1"]`
evaluates to `1`, and `["leaf", "[1,2]"]` evaluates to `[1, 2]`.

### ref

Resolves a path of segments against the server module. Segments are scalar
values and are matched against the declared schema. Anything not declared in the
schema throws a `SendScriptReferenceError`, and so does an empty path.

```json
["ref", "add"]
```
```json
"[function]"
```

This evaluates to the `add` function. A path with more segments reaches nested
members: `["ref", "nested", "square"]` evaluates to the `nested.square`
function.

### call

Calls the evaluated callee with the evaluated arguments. The third element must
be a JSON array of argument nodes; each argument is evaluated deeply first.

```json
["call", ["ref", "add"], [["leaf", "1"], ["leaf", "2"]]]
```
```json
3
```

This evaluates to `3`.

### fn and arg

Creates a closure. The second element is a JSON array of argument names, the
third element is the body, evaluated when the closure is called. Inside the
body, `["arg", <id>]` reads a bound argument. Argument names may be any scalar:
strings or array indexes like `0`. The scope of a body chains to the enclosing
closure's scope.

`"__proto__"` is reserved and cannot be used as an argument name.

```json
["call",
  ["fn", [0], ["call", ["ref", "square"], [["arg", 0]]]],
  [["leaf", "3"]]]
```
```json
9
```

This evaluates to `9`.

### then

Behaves like `Promise.prototype.then` on the evaluated first element. The
handlers are evaluated before the promise settles, so a handler that needs the
resolved value must be a closure created with `fn`. A rejection without a
rejection handler propagates to the program result where the caller can catch
it.

```json
["then",
  ["call", ["ref", "resolve"], [["leaf", "1"]]],
  ["fn", [0], ["call", ["ref", "add"], [["arg", 0], ["leaf", "2"]]]]]
```
```json
3
```

This evaluates to `3`.

### await

Collects the program for evaluation and resolves its result when it settles.
When a program contains awaits, `parse` returns a promise that resolves to the
final result. Awaits may appear at any position, including as a property value.

```json
["await", ["call", ["ref", "resolve"], [["leaf", "1"]]]]
```
```json
1
```

This evaluates to `1`.

```json
{
  "slow": ["await", ["call", ["ref", "slowAdd"], [20, 22]]]
}
```
```json
{"slow":42}
```

This evaluates to `{ "slow": 42 }`.

### quote

Returns the value as is. It is not evaluated in the evaluation pass. Note that
the reviver pass still runs: refs and leaves inside quoted data are resolved
before `quote` ever sees them. To send operator-shaped _data_, use `stringify`,
which escapes the operator keywords.

```json
["quote", { "tag": "plain", "nested": [1, 2] }]
```
```json
{"tag":"plain","nested":[1,2]}
```

This evaluates to `{ "tag": "plain", "nested": [1, 2] }`.

## Data shapes

Plain arrays are evaluated in place and return the array with evaluated
elements. Plain objects are evaluated in place and return the object with
evaluated property values. This composes with all operators.

```json
{
  "sum": ["call", ["ref", "add"], [["leaf", "1"], ["leaf", "2"]]],
  "label": ["leaf", "\"total\""],
  "list": [["call", ["ref", "add"], [["leaf", "3"], ["leaf", "4"]]], "text"]
}
```
```json
{"sum":3,"label":"total","list":[7,"text"]}
```

This evaluates to `{ "sum": 3, "label": "total", "list": [7, "text"] }`.

## Escaping

The operator keywords are `leaf`, `ref`, `call`, `fn`, `arg`, `quote`, `await`
and `then`. When hand-writing a program, a data value that would collide with an
operator needs to be marked. `stringify` does this automatically for data:
strings become leaves and operator-shaped arrays get quoted.

```json
{
  "s": ["leaf", "\"call\""],
  "a": [["quote", "await"], []]
}
```
```json
{"s":"call","a":["await",[]]}
```

This is what `stringify` produces for the data
`{ "s": "call", "a": ["await", []] }`, and it evaluates back to that same data.

## Error behavior

Malformed forms and misuse throw catchable errors per parse call: invalid JSON
and invalid leaf text throw `SyntaxError`, calling non-functions or malformed
operator shapes throw `TypeError`, deep nesting throws `RangeError`, and invalid
refs throw `SendScriptReferenceError`. Rejections that a program drops, for
example the result of a call bound to an unused argument, are contained so they
cannot crash the host process. Rejections that surface in the program result are
left for the caller to catch.
