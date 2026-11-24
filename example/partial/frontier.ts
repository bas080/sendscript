import Stringify from 'sendscript/stringify.ts'
import Parse from 'sendscript/parse.ts'
import references from 'sendscript/references.ts'
import { frontierEnv, MissingImplementation } from './frontier-env.ts'

const { add, remote } = references(['add', 'remote'])
const local = { add: (a: number, b: number) => a + b }

const program = Stringify()(remote(add(1, 2)))

try {
  Parse(['add', 'remote'], frontierEnv(local))(program)
} catch (error) {
  if (!(error instanceof MissingImplementation)) throw error

  console.log('stopped at:', error.path.join('.'), 'args:', JSON.stringify(error.args))

  const residual = Stringify()(remote(...(error.args as number[])))

  console.log('residual program:', residual)

  const remoteHost = Parse(['remote'], { remote: (x: number) => x * 10 })

  console.log('remote completion:', remoteHost(residual))
}
