import {
  awaitSymbol,
  call,
  ref
} from './symbol.js'

type ModuleFunction = {
  (...args: any[]): any
  toJSON?: () => any
  then?: (resolve: (value: any) => any) => any
}

function instrument (name: string): ModuleFunction {
  function reference (...args: any[]): ModuleFunction {
    const called = instrument(name)

    called.toJSON = () => ({
      [call]: call,
      call: true,
      ref: reference,
      args
    })

    return called
  }

  reference.then = (resolve: (value: any) => any) => {
    const awaited = instrument(name)

    delete awaited.then

    awaited.toJSON = () => ({
      [awaitSymbol]: awaitSymbol,
      await: true,
      ref: reference
    })

    return resolve(awaited)
  }

  reference.toJSON = () => ({
    [ref]: ref,
    reference: true,
    name
  })

  return reference
}

export default function SendScriptModule (schema: string[] | Record<string, any>): Record<string, ModuleFunction> {
  if (!Array.isArray(schema)) return SendScriptModule(Object.keys(schema))

  return schema.reduce((api: Record<string, ModuleFunction>, name: string) => {
    api[name] = instrument(name)

    return api
  }, {})
}
