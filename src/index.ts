import type { UnoGenerator } from '@unocss/core'
import type { CustomCssLayerConfig } from './extract'
import { definePreset } from '@unocss/core'
import {
  extractCustomCssFromCss,
  extractUnoClassTokensFromCss,
} from './extract'

export {
  createUnoUtilityRuleMatcher,
  CUSTOM_CSS_DEFAULT_LAYERS,
  type CustomCssLayerConfig,
  extractCustomCssFromCss,
  type ExtractCustomCssOptions,
  extractTokensFromSelector,
  extractUnoClassTokensFromCss,
  resolveCustomCssLayers,
  type UnoUtilityRuleMatcher,
} from './extract'

const DEFAULT_CUSTOM_CSS_LAYER = 'preset-overwrite-custom'
const DEFAULT_CUSTOM_CSS_LAYER_INDEX = 9999

export interface CustomCssOptions {
  layerName?: string
  layerIndex?: number
  /**
   * Which compiled CSS layers are included in custom CSS output.
   *
   * - `preserve` — copy the whole layer (e.g. `['palette']`)
   * - `default` — filter: only non-Uno rules ({@link CUSTOM_CSS_DEFAULT_LAYERS} when omitted)
   * - `skip` — never include (overrides `preserve` / `default`)
   */
  layers?: CustomCssLayerConfig
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
   * Requires layer markers in `css`; otherwise has no effect. Configure `layers.preserve` /
   * `layers.default` to control which `layer:` comment blocks are included. For trailing CSS after
   * Uno layers, use `@unocss-preset-overwrite:static`.
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
      getCSS: async (ctx) => {
        const custom = await extractCustomCssFromCss(toValue(options.css), {
          generator: ctx.generator as UnoGenerator,
          layers: customCssOpts.layers,
        })
        return custom || undefined
      },
    }],
    layers: {
      [layerName]: layerIndex,
    },
  }
})

export { presetOverwrite, type PresetOverwriteOptions }
