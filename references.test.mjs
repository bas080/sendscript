import { test } from 'tap'
import references from './references.mjs'

test('invalid uses of references', t => {
  t.throws(() => references([['a']]))
  t.throws(() => references([{}]))
  t.end()
})
