import module from 'sendscript/module.js'
import type * as mathTypes from './math.ts'

const math = module([
  'add',
  'square'
]) as typeof mathTypes

export default math
