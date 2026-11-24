# Contributing

The markdown in this repository uses
[markatzea](https://github.com/bas080/markatzea) to evaluate code-blocks.
Markatzea reads a markdown file, pipes each code-block that declares an
interpreter into that interpreter as stdin and prints the output of the process
to a separate code-block:

```bash
markatzea ./file.mz > ./file.md
```

The socket.io example in README.mz uses a shared port between the server and the
client. Export it in your environment before running markatzea; the examples
fall back to port 3000 when it is not exported:

```bash
export SENDSERVER_PORT=4211
```

The pre-push git hook.

```bash cat - > .git/hooks/pre-push
#!/usr/bin/env bash

set -xeuo pipefail

npm t
npm run typecheck
npx prettier -c --parser markdown *.mz
```

For the README.mz examples to work we need sendscript to be linked.

```bash bash > /dev/null
set -e

npm ci
npm link
npm link sendscript
(cd ./example && npm install)
```

Check if packages are up to date on release.

```bash bash
npm outdated && echo 'No outdated packages found'
```

Check if no vulnerable dependencies in production.

```bash bash
npm audit --production
```

Check if code type checks.

```bash bash
npm run typecheck
```

Check if markdown is correctly formatted.

```bash bash
npx prettier --check --parser markdown ./README.mz ./CODE-ON-DEMAND.mz ./PARTIAL-EVALUATION.mz ./CONTRIBUTING.md
```

Generate the README and the chapters from the mz files. The CODE-ON-DEMAND.mz
and PARTIAL-EVALUATION.mz examples are runnable like the README examples.

```bash bash
markatzea ./README.mz | tee ./README.md

markatzea ./CODE-ON-DEMAND.mz | tee ./CODE-ON-DEMAND.md

markatzea ./PARTIAL-EVALUATION.mz | tee ./PARTIAL-EVALUATION.md

npx markdown-toc --maxdepth 3 -i README.md

git add *.md ./example
```

The SENDSCRIPT.md program-format examples are runnable. SENDSCRIPT.mz is the
source and each of its JSON code-blocks is piped as stdin into the `evalagram`
function that evaluates the program against the vocabulary documented in the
file. Generate the SENDSCRIPT.md from the mz source. Exporting shell functions
for marks like `evalagram` only works when the blocks run in bash.

```bash bash
evalagram() {
  node ./script/evalagram.ts
}
export -f evalagram

markatzea ./SENDSCRIPT.mz | tee ./SENDSCRIPT.md

git add ./SENDSCRIPT.md
```
