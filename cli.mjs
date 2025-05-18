#!/usr/bin/env node

import { program } from 'commander'
import path from 'path'
import { pathToFileURL } from 'url'
import stringify from './stringify.mjs'
import repl from './repl.mjs'
import Parse from './parse.mjs'

program

  .command('repl <module>')
  .description('Start a repl that uses sendscript parsing')
  .action(async (module, options) => {
    const modulePath = pathToFileURL(path.resolve(process.cwd(), module)).href
    const mod = await import(modulePath)
    const parse = Parse(mod)

    const send = program => parse(stringify(program))

    repl(send, mod)
  })

program.parse(process.argv)
