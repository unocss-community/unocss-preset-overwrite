import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  external: ['unocss', 'postcss', 'postcss-selector-parser'],
})
