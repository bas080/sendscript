#!/usr/bin/env node

import path from 'path'
import { pathToFileURL } from 'url'
import Stringify from './stringify.ts'
import repl from './repl.ts'
import Parse from './parse.ts'

const stringify = Stringify()
const modulePath = pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href
const mod = await import(modulePath) as Record<string, unknown>
const parse = Parse(Object.keys(mod), mod)

const send = (program: unknown) => parse(stringify(program))

repl(send, mod)
