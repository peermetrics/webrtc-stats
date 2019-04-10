import builtins from 'rollup-plugin-node-builtins'

import pkg from './package.json'

const plugins = [
  builtins()
]

export default [{
  input: 'src/browser.mjs',
  output: [
    {
      file: pkg.browser,
      format: 'iife'
    }
  ],
  plugins: plugins
}, {
  input: 'src/module.mjs',
  output: [
    {
      file: pkg.main,
      format: 'cjs'
    }
  ],
  plugins: plugins
}]
