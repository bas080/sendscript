import Parse from 'sendscript/parse.ts'
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'
import * as api from './module.ts'

const { resolved, rejected } = references(['resolved', 'rejected'])
const stringify = Stringify()
const parse = Parse(['divide'], api)

export default async function handle (program: string): Promise<string> {
  try {
    return stringify(resolved(await parse(program)))
  } catch (error) {
    return stringify(rejected((error as Error).message))
  }
}
