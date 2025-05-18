import * as component from './component.mjs'

import { render } from '@lit-labs/ssr'
import {
  collectResultSync
} from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

process.env.TZ = 'utc'

function mapValues (transform, value) {
  return Object.keys(value).reduce((acc, key) => {
    acc[key] = transform(value[key])
    return acc
  }, {})
}

export default mapValues((value) => (...args) => {
  return collectResultSync(render(value(...args)))
}, component)
