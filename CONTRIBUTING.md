# Contributing

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

Check if code follows standard formatting.

```bash bash
npx standard
```

Check if markdown is correctly formatted.

```bash bash
npx prettier --check --parser markdown ./README.mz ./CONTRIBUTING.md
```

Generate the README from the mz file.

```bash bash
markatzea ./README.mz | tee ./README.md

npx documentation readme references.mjs stringify.mjs parse.mjs -s Reference --github --a public --markdown-toc false

npx markdown-toc --maxdepth 3 -i README.md

git add *.md ./example
```
