export class MissingImplementation extends Error {
  path: string[]
  args: unknown[]

  constructor (path: string[], args: unknown[]) {
    super(`missing implementation: ${path.join('.')}`)

    this.path = path
    this.args = args
  }
}

export const frontierEnv = (
  env: Record<string, unknown>
): Record<string, unknown> =>
  new Proxy(env, {
    get (target, prop) {
      if (typeof prop !== 'string' || prop in target) return target[prop]

      return (...args: unknown[]) => {
        throw new MissingImplementation([prop], args)
      }
    }
  })
