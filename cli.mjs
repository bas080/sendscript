#!/usr/bin/env node

import path from 'path'
import { pathToFileURL } from 'url'
import Stringify from './stringify.mjs'
import repl from './repl.mjs'
import Parse from './parse.mjs'

const stringify = Stringify()
const modulePath = pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href
const mod = await import(modulePath)
const parse = Parse(Object.keys(mod), mod)

const send = program => parse(stringify(program))

repl(send, mod)
