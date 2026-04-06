#!/usr/bin/env node

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import stringify from './stringify.js'
import repl from './repl.js'
import createParser from './parse.js'

const modulePath = pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href
const mod = await import(modulePath) as Record<string, any>
const parse = createParser(mod)

const send = (program: any) => parse(stringify(program))

repl(send, mod)
