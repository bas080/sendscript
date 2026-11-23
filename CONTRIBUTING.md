# Contributing

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
cd ./example
```

Check if packages are up to date on release.

```bash bash
npm outdated && echo 'No outdated packages found'
```

Check if no vulnerable dependencies

```bash bash
npm audit
```

Check if code type checks.

```bash bash
npm run typecheck
```

Check if markdown is correctly formatted.

```bash bash
npx prettier --check --parser markdown ./README.mz ./CONTRIBUTING.md
```

Generate the README from the mz file.

```bash bash
markatzea ./README.mz | tee ./README.md

npx markdown-toc --maxdepth 3 -i README.md

git add *.md ./example
```

The SENDSCRIPT.md program-format examples are runnable. SENDSCRIPT.mz is the
source and each of its JSON code-blocks is piped as stdin into the `evalagram`
function that evaluates the program against the vocabulary documented in the
file. Define and export the function so markatzea can find it.

```bash bash
evalagram() { node ./evalagram.ts }
export -f evalagram
```

Generate the SENDSCRIPT.md from the mz source.

```bash bash
markatzea ./SENDSCRIPT.mz | tee ./SENDSCRIPT.md

git add ./SENDSCRIPT.mz ./SENDSCRIPT.md
```
