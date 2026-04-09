import { defineConfig } from 'unocss'
import { presetWind4 } from 'unocss/preset-wind4'
import { presetOverwrite } from './src'

// Just for Vscode Extension

export default defineConfig({
  presets: [
    presetWind4(),
    presetOverwrite({ css: '' }),
  ],
})
