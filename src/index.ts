import { definePreset } from '@unocss/core'
import { extractUnoClassTokensFromCss } from './extract'

interface PresetOverwriteOptions {
  /**
   * Full compiled CSS string. PostCSS parses selectors; classes and attributify selectors become
   * Uno utility tokens and are added via safelist.
   */
  css?: (() => string) | string
}

function toValue(value?: string | (() => string)): string {
  if (typeof value === 'function')
    return value()
  return value ?? ''
}

const presetOverwrite = definePreset((options: PresetOverwriteOptions = {}) => {
  return {
    name: 'unocss-preset-overwrite',
    safelist: [() => {
      const css = toValue(options.css)
      return extractUnoClassTokensFromCss(css)
    }],
  }
})

export { extractUnoClassTokensFromCss, presetOverwrite, type PresetOverwriteOptions }
