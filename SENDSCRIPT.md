# SendScript program format

A SendScript program is a plain JSON document. The client builds it with
`references` and `stringify`, sends it over any transport, and the server
evaluates it with `parse` against a real module. This document describes the
JSON exactly.

The evaluation model has two passes:

1. The reviver pass (during `JSON.parse`) deserializes leaf text, resolves refs
   against the server module, and collects awaits.
2. The evaluation pass walks the resulting structure and runs the operators.

Everything else — plain arrays and plain objects — is a data shape that gets
evaluated in place, property by property.

## Operators

A program is any JSON value. An array whose first element is one of the
operator keywords is interpreted as an operator node. Any other value is data.

| Operator | Shape | Evaluates to |
| --- | --- | --- |
| `leaf` | `["leaf", "<json text>"]` | `JSON.parse`d text |
| `ref` | `["ref", "`segment`", ...]` | module member at the path |
| `call` | `["call", <callee>, [<args>]]` | called function result |
| `fn` | `["fn", [<ids>], <body>]` | closure |
| `arg` | `["arg", <id>]` | bound argument in scope |
| `quote` | `["quote", <value>]` | value verbatim, not evaluated |
| `await` | `["await", <program>]` | resolved value of program |
| `then` | `["then", <v>, <h>, <h>?]` | chained promise |

### leaf

Leaf text is JSON stringified on the client and parsed on the server. This is
where (de)serialization of anything JSON cannot express can be customized, at
the `leafParse`/`leafStringify` hook.

```js
['leaf', '"Hello"'] // => "Hello"
['leaf', '1']       // => 1
['leaf', '[1,2]']   // => [1, 2]
```

### ref

Resolves a path of segments against the server module. Segments are scalar
values and are matched against the declared schema. Anything not declared in
the schema throws a `SendScriptReferenceError`, and so does an empty path.

```js
['ref', 'add']     // the add function
['ref', 'nested', 'square'] // the nested.square function
```

### call

Calls the evaluated callee with the evaluated arguments. The third element must
be a JSON array of argument nodes; each argument is evaluated deeply first.

```js
['call', ['ref', 'add'], [['leaf', '1'], ['leaf', '2']]] // => 3
```

### fn and arg

Creates a closure. The second element is a JSON array of argument names, the
third element is the body, evaluated when the closure is called. Inside the
body, `["arg", <id>]` reads a bound argument. Argument names may be any
scalar: strings or array indexes like `0`. The scope of a body chains to the
enclosing closure's scope.

`"__proto__"` is reserved and cannot be used as an argument name.

```js
['call',
  ['fn', [0], ['call', ['ref', 'square'], [['arg', 0]]]],
  [['leaf', '3']]] // => 9
```

### then

Behaves like `Promise.prototype.then` on the evaluated first element. The
handlers are evaluated first; non-callable handlers are ignored. A rejection
without a rejection handler propagates to the program result where the caller
can catch it.

```js
['then',
  ['call', ['ref', 'resolve'], [['leaf', '1']]],
  ['call', ['ref', 'add'], [['arg', 0], ['leaf', '2']]]] // => 3
```

### await

Collects the program for evaluation and resolves its result when it settles.
When a program contains awaits, `parse` returns a promise that resolves to the
final result. Awaits may appear at any position, including as a property value.

```js
['await', ['call', ['ref', 'resolve'], [['leaf', '1']]]]     // => 1
{ 'slow': ['await', ['call', ['ref', 'slowAdd'], [20, 22]]] } // => { 'slow': 42 }
```

### quote

Returns the value as is. It is not evaluated in the evaluation pass. Note that
the reviver pass still runs: refs and leaves inside quoted data are resolved
before `quote` ever sees them. To send operator-shaped *data*, use `stringify`,
which escapes the operator keywords.

```js
['quote', { tag: 'plain', nested: [1, 2] }] // => { tag: 'plain', nested: [1, 2] }
```

## Data shapes

Plain arrays are evaluated in place and return the array with evaluated
elements. Plain objects are evaluated in place and return the object with
evaluated property values. This composes with all operators.

```js
{
  'sum': ['call', ['ref', 'add'], [['leaf', '1'], ['leaf', '2']]],
  'label': ['leaf', '"total"'],
  'list': [['call', ['ref', 'add'], [['leaf', '3'], ['leaf', '4']]], 'text']
} // => { sum: 3, label: 'total', list: [7, 'text'] }
```

## Escaping

The operator keywords are `leaf`, `ref`, `call`, `fn`, `arg`, `quote`, `await`
and `then`. When hand-writing a program, a data value that would collide with
an operator needs to be marked. `stringify` does this automatically for data:
strings become leaves and operator-shaped arrays get quoted.

```js
// given { 's': 'call', 'a': ['await', []] }
{ 's': ['leaf', '"call"'], 'a': [['quote', 'await'], []] }
```

## Error behavior

Malformed forms and misuse throw catchable errors per parse call: invalid JSON
and invalid leaf text throw `SyntaxError`, calling non-functions or malformed
operator shapes throw `TypeError`, deep nesting throws `RangeError`, and
invalid refs throw `SendScriptReferenceError`. Rejections that a program drops,
for example the result of a call bound to an unused argument, are contained so
they cannot crash the host process. Rejections that surface in the program
result are left for the caller to catch.
