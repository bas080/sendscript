#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import { pathToFileURL } from 'url';
import { startServer } from './http/server.mjs';
import Debug from './debug.mjs'

const debug = Debug.extend('cli')

program
  .command('http <envModulePath>')
  .description('Start an HTTP server with the given env module')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .action(async (envModulePath, options) => {
    const port = parseInt(options.port, 10);

    // Convert to file URL for dynamic import
    const fullPath = path.resolve(envModulePath);
    const moduleURL = pathToFileURL(fullPath);

    try {
      const envModule = await import(moduleURL.href);
      const env = envModule.default || envModule;

      await startServer(env, port);
    } catch (err) {
      debug('Failed to load environment module:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);
