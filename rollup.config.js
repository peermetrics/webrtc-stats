import typescript from '@rollup/plugin-typescript'

import builtins from 'rollup-plugin-node-builtins'
import babel from 'rollup-plugin-babel'

import pkg from './package.json'
import babelConfig from './.babelrc.json'

const plugins = [
  builtins(),
  typescript(),
  babel(babelConfig)
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
  input: 'src/module.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs'
    }
  ],
  plugins: plugins
}]
