import Stringify from 'sendscript/stringify.ts'
import Parse from 'sendscript/parse.ts'
import references from 'sendscript/references.ts'
import { frontierEnv, MissingImplementation } from './frontier-env.ts'

const { add, remote, stage: stageRef } = references(['add', 'remote', 'stage'])
const local = { add: (a: number, b: number) => a + b }

const stage = (fragment: unknown): unknown => {
  const fragmentParse = Parse(['add', 'remote'], frontierEnv(local))

  try {
    return { status: 'done', value: fragmentParse(JSON.stringify(fragment)) }
  } catch (error) {
    if (!(error instanceof MissingImplementation)) throw error

    const path = error.path as ('add' | 'remote')[]
    const residual = Stringify()(references(path)[path[0]](...(error.args as number[])))

    return { status: 'residual', program: residual }
  }
}

const parse = Parse(['stage'], { stage })
const stringify = Stringify()

const result = parse(stringify([
  stageRef(JSON.parse(stringify(add(1, 2)))),
  stageRef(JSON.parse(stringify(remote(add(1, 2)))))
]))

console.log('staged:', JSON.stringify(result))

const residual = (result as unknown as { program: string }[])[1].program

const remoteHost = Parse(['remote'], { remote: (x: number) => x * 10 })

console.log('remote completion:', remoteHost(residual))
