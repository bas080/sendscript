#!/usr/bin/env node

import Debug from '../debug.mjs'
import repl from 'node:repl'
import httpClient from './client.mjs'

const send = httpClient(process.argv[2])

const debug = Debug.extend('repl')

function initRepl (cb) {
  debug('Starting REPL')
  repl.start({
    prompt: '> ',
    eval: cb
  })
}

(async function () {
  debug(`importing ${process.argv[2]}`)

  console.log(await import(process.argv[2]))

  Object.assign(global, (await import(process.argv[2])).default)

  debug('import completed and assigned to global')

  initRepl(async function awaitEval (cmd, context, filename, callback) {
    callback(null, await send(eval(cmd)))
  })
})()
