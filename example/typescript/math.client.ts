/**
 * Client-side type-safe stubs for the math API
 *
 * Pass your server module types as a type argument to get full TypeScript
 * support and IDE autocomplete.
 */

import type * as mathTypes from './math.ts'
import references from 'sendscript/references.ts'

// Create type-safe stubs - this tells TypeScript that 'add' and 'square'
// have the same signatures as the server functions
export default references<typeof mathTypes>(['add', 'square'])
