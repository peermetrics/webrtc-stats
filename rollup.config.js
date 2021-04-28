import typescript from '@rollup/plugin-typescript'

import builtins from 'rollup-plugin-node-builtins'
import babel from 'rollup-plugin-babel'
import { terser } from 'rollup-plugin-terser'

import pkg from './package.json'
import babelConfig from './.babelrc.json'

const plugins = [
  builtins(),
  typescript(),
  babel(babelConfig)
]

export default [{
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/browser.js',
      name: 'window',
      format: 'iife',
      extend: true
    },
    {
      file: 'dist/browser.min.js',
      format: 'iife',
      name: 'window',
      extend: true,
      plugins: [terser()]
    },
    {
      file: pkg.main,
      format: 'cjs'
    }
  ],
  plugins: plugins
}]
