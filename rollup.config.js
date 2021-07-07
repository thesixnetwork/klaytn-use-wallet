import babel from 'rollup-plugin-babel'
import builtins from 'builtin-modules'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'
import image from '@rollup/plugin-image';


export default {
  input: './src/index.js',
  output: [
    {
      dir: './dist',
      format: 'esm',
      sourcemap: true,
    },
    {
      dir: './dist/cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
  ],
  context: 'window',
  external: [...builtins, 'react'],
  plugins: [
    image(),
    babel({
      exclude: 'node_modules/**',
    }),
    resolve({
      mainFields: ['module', 'browser', 'jsnext', 'main'],
      preferBuiltins: false,
    }),
    commonjs({
      namedExports: {
        "react-dom": ["createPortal", "findDOMNode"],
      },
    }),
    json(),
    terser(),
  ],
}
