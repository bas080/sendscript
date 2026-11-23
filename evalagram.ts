#!/usr/bin/env node

import path from 'path'
import { pathToFileURL } from 'url'
import Parse from './parse.ts'
import type { Schema } from './schema.ts'

const schema: Schema = [
  'add',
  'square',
  ['nested', ['square']],
  'resolve',
  'slowAdd'
]

const vocabulary = {
  add: (a: number, b: number) => a + b,
  square: (x: number) => x * x,
  nested: {
    square: (x: number) => x * x
  },
  resolve: (value: unknown) => Promise.resolve(value),
  slowAdd: (a: number, b: number) =>
    new Promise((resolve) => setTimeout(() => resolve(a + b), 10))
}

export default function evalagram (json: string): unknown {
  return Parse(schema, vocabulary)(json)
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const program = await new Promise<string>((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })

  const out = await Promise.resolve(evalagram(program))

  console.log(typeof out === 'function' ? '"[function]"' : JSON.stringify(out))
}
