import builtins from 'rollup-plugin-node-builtins'

import pkg from './package.json'

export default {
  input: 'module.mjs',
  output: [
    {
      file: pkg.browser,
      format: 'iife',
      name: 'rtcStats'
    }
  ],
  plugins: [
    builtins()
  ]
}
