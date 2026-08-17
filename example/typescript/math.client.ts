/**
 * Client-side type-safe stubs for the math API
 * 
 * This file creates typed references that mirror the server's functions.
 * The 'as typeof mathTypes' cast gives us full TypeScript support and IDE autocomplete.
 */

import type * as mathTypes from './math.ts'
import references from 'sendscript/references.mjs'

// Create type-safe stubs - this tells TypeScript that 'add' and 'square' 
// have the same signatures as the server functions
export default references(['add', 'square']) as typeof mathTypes

