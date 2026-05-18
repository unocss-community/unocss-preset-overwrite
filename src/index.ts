import { definePreset } from '@unocss/core'
import { extractCustomCssFromCss, extractUnoClassTokensFromCss } from './extract'

const DEFAULT_CUSTOM_CSS_LAYER = 'preset-overwrite-custom'
const DEFAULT_CUSTOM_CSS_LAYER_INDEX = 9999

interface CustomCssOptions {
  /**
   * CSS layer name for appended static CSS (`preflights` entry).
   *
   * @default 'preset-overwrite-custom'
   */
  layerName?: string
  /**
   * Sort order for {@link CustomCssOptions.layerName} in UnoCSS layer output (higher = later).
   *
   * @default 9999
   */
  layerIndex?: number
}

interface PresetOverwriteOptions {
  /**
   * Full compiled CSS string. PostCSS parses selectors; classes and attributify selectors become
   * Uno utility tokens and are added via safelist.
   */
  css?: (() => string) | string
  /**
   * Append CSS outside Uno `layer:` blocks (custom static rules, `@media`, etc.) to the output.
   *
   * - `false` — disabled
   * - `true`, `{}`, or omitted — enabled with defaults
   * - `{ layerName, layerIndex }` — enabled with overrides
   *
   * Requires layer markers in `css`; otherwise has no effect. For custom CSS placed after Uno
   * layers, prefix it with the `@unocss-preset-overwrite:static` block comment.
   *
   * @default {}
   */
  customCss?: boolean | CustomCssOptions
}

function toValue(value?: string | (() => string)): string {
  if (typeof value === 'function')
    return value()
  return value ?? ''
}

const presetOverwrite = definePreset((options: PresetOverwriteOptions = {}) => {
  const preset = {
    name: 'unocss-preset-overwrite',
    safelist: [() => {
      const css = toValue(options.css)
      return extractUnoClassTokensFromCss(css)
    }],
  }

  if (options.customCss === false)
    return preset

  const customCssOpts: CustomCssOptions
    = options.customCss === true || options.customCss === undefined
      ? {}
      : options.customCss
  const layerName = customCssOpts.layerName ?? DEFAULT_CUSTOM_CSS_LAYER
  const layerIndex = customCssOpts.layerIndex ?? DEFAULT_CUSTOM_CSS_LAYER_INDEX

  return {
    ...preset,
    preflights: [{
      layer: layerName,
      getCSS: () => {
        const custom = extractCustomCssFromCss(toValue(options.css))
        return custom || undefined
      },
    }],
    layers: {
      [layerName]: layerIndex,
    },
  }
})

export {
  type CustomCssOptions,
  extractCustomCssFromCss,
  extractUnoClassTokensFromCss,
  presetOverwrite,
  type PresetOverwriteOptions,
}
