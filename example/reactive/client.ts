import handle from './server.ts'
import Parse from 'sendscript/parse.ts'
import Stringify from 'sendscript/stringify.ts'
import references from 'sendscript/references.ts'

const { divide } = references(['divide'])
const stringify = Stringify()

const parse = Parse(['resolved', 'rejected'], {
  resolved: (value: number) => console.log('resolved with', value),
  rejected: (message: string) => console.log('rejected with', message)
})

const send = async (program: unknown) =>
  parse(await handle(stringify(program)))

await send(divide(4, 2))

await send(divide(1, 0))
