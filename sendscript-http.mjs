#!/usr/bin/env node

import repl from './repl.mjs';
import http from 'http';
import Debug from './debug.mjs'
import fs from 'fs';
import path from 'path';
import url from 'url';
import Parse from './parse.mjs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const debug = Debug.extend('http-server')

const argv = yargs(hideBin(process.argv))
  .option('module', {
    alias: 'm',
    type: 'string',
    description: 'Path to the JS module to serve',
    default: './module.mjs',
  })
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to listen on',
    default: 3000,
  })
  .option('per-request', {
    alias: 'r',
    type: 'boolean',
    description: 'Path to a JS file exporting a function: (req) => module',
  })
  .help('h')
  .alias('h', 'help')
  .parse();

debug('argv', argv)

const moduleFullPath = path.resolve(process.cwd(), argv.module);
if (!fs.existsSync(moduleFullPath)) {
  console.error(`Module not found: ${moduleFullPath}`);
  process.exit(1);
}

async function loadModule() {
  const m = await import(url.pathToFileURL(moduleFullPath).href + `?t=${Date.now()}`);
  if (!m.schema) {
    throw new Error(`Module must export a "schema" property`);
  }
  return m;
}

// Load initial module
let mod = await loadModule();

repl(send, mod.repl)

const identity = x => x

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'POST only' }));
  }


  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const module = argv.perRequest ? mod.default(req) : mod.default
      const parse = Parse(mod.schema, module)
      const result = await parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(argv.port, () => {
  console.log(`Serving module via SendScript on http://localhost:${argv.port}`);
});
