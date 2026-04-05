# Contributing


For the README.mz examples to work we need sendscript to be linked.

```bash bash > /dev/null
set -e

npm link
npm link sendscript
cd ./example
npm ci
npm link sendscript
```

Generate the README from the mz file.

```bash bash
markatzea ./README.mz | tee ./README.md

npx markdown-toc -i README.md

git add *.md ./example
```
