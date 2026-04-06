#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import stringify from './stringify.js';
import repl from './repl.js';
import createParser from './parse.js';
const modulePath = pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href;
const mod = await import(modulePath);
const parse = createParser(mod);
const send = (program) => parse(stringify(program));
repl(send, mod);
//# sourceMappingURL=cli.js.map