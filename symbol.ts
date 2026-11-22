export const ref = Symbol('ref')
export const call = Symbol('call')
export const awaitSymbol = Symbol('await')
export const then = Symbol('then')
export const referenceSymbol = Symbol('referenceSymbol')

export interface RefJSON {
  readonly [ref]: typeof ref
  readonly path: string[]
}

export interface CallJSON {
  readonly [call]: typeof call
  readonly ref: unknown
  readonly args: unknown[]
}

export interface ThenJSON {
  readonly [then]: typeof then
  readonly ref: unknown
  readonly resolve: unknown
  readonly reject: unknown
}

export interface AwaitJSON {
  readonly [awaitSymbol]: typeof awaitSymbol
  readonly ref: unknown
}

export type ReferenceJSON = RefJSON | CallJSON | ThenJSON | AwaitJSON
