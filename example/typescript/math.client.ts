import type * as mathTypes from './math.ts'
import Stringify from 'sendscript/stringify.mjs'
import references from 'sendscript/references.mjs'

export default references(['add', 'square']) as typeof mathTypes
