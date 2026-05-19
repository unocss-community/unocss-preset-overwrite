# unocss-preset-overwrite [![npm](https://img.shields.io/npm/v/unocss-preset-overwrite)](https://npmjs.com/package/unocss-preset-overwrite)

Rebuild UnoCSS output with a new theme while keeping the same tokens.

This preset parses selectors from a previously generated CSS string and feeds them back into UnoCSS through `safelist`. Non-utility CSS from the same file can be preserved via `customCss` (before the first `layer:` marker, inside configured layers, or after `@unocss-preset-overwrite:static`).

## Why

When you only have compiled CSS (instead of source templates), switching theme values usually requires regenerating the same utility tokens.

`unocss-preset-overwrite` helps by:

- extracting class tokens (e.g. `.text-red-500`, `.md\:grid-cols-2`)
- extracting attributify tokens (e.g. `[bg~="red-500"]`, `[flex=""]`)
- safelisting those tokens for the next UnoCSS run
- optionally appending your own static CSS (`@media`, `@keyframes`, component styles, etc.)

## Installation

```bash
pnpm add -D unocss unocss-preset-overwrite
```

## Usage

```ts
// uno.config.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'unocss'
import { presetOverwrite } from 'unocss-preset-overwrite'
import presetWind4 from 'unocss/preset-wind4'

const css = readFileSync(
  fileURLToPath(import.meta.resolve('./style.css')),
  'utf-8',
)

export default defineConfig({
  presets: [
    presetWind4(),
    presetOverwrite({ css }),
  ],
})
```

Change the theme in `uno.config.ts`, run UnoCSS again, and utilities are regenerated from the same tokens while theme variables update.

### Attributify support

Use your regular attributify preset together with this preset:

```ts
import presetAttributify from '@unocss/preset-attributify'
import { defineConfig } from 'unocss'
import { presetOverwrite } from 'unocss-preset-overwrite'
import presetWind4 from 'unocss/preset-wind4'

export default defineConfig({
  presets: [
    presetWind4(),
    presetAttributify(),
    presetOverwrite({ css: previousCompiledCss }),
  ],
})
```

## Custom static CSS

By default, `customCss` is enabled and appended via a preflight. Input CSS must contain Uno `/* layer: … */` markers; otherwise only safelist extraction runs.

### What gets collected

| Source | Config |
|--------|--------|
| Before the first `/* layer: … */` | always |
| After `/* @unocss-preset-overwrite:static */` | always (until next `layer:`) |
| Layers in `layers.default` | filter via `UnoGenerator` — keep rules that are **not** utilities (e.g. Vue scoped `[data-v-…]`, `.chat-box-monaco-code`) |
| Layers in `layers.preserve` | whole layer as-is (e.g. `palette` for compiled `:root` vars) |
| Other layers | skipped — rebuilt by your presets on `generate` |

Priority: `skip` > `preserve` > `default`.

Omitting `layers.default` uses `['default', 'utilities', 'shortcuts']` (see `CUSTOM_CSS_DEFAULT_LAYERS`). Utility rules in those layers are regenerated through `safelist`, not copied.

**Recommended:** place hand-written styles **before** the first `/* layer: … */` comment:

```css
/* your-custom.css */
@media (min-width: 768px) {
  .sidebar { width: 200px; }
}

/* --- Uno compiled output below --- */
/* layer: theme */
…
/* layer: utilities */
.flex { display: flex; }
```

**Vue SFC / bundled scoped CSS** after `/* layer: default */` is picked up automatically when class names are not utility tokens.

**Trailing CSS after all layers:** add a static-region marker so it is collected without generator filtering:

```css
/* layer: utilities */
.flex { display: flex; }

/* @unocss-preset-overwrite:static */
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
```

The marker turns on `staticRegion` until the next `/* layer: … */` — useful when bundled CSS continues after the last Uno layer comment.

### Configure `customCss`

```ts
presetOverwrite({
  css,
  customCss: false, // safelist only
})

presetOverwrite({
  css,
  // enabled (same as omitting customCss or customCss: true)
})

presetOverwrite({
  css,
  customCss: {
    layerName: 'my-components',
    layerIndex: 100, // higher = later in output
    layers: {
      preserve: ['palette'],
      default: ['default', 'utilities', 'shortcuts'],
      skip: ['theme'],
    },
  },
})
```

**Note:** `layers.default` is the config key (layers to filter). It is unrelated to the Uno output layer name `'default'`, though that name is included in the default list.

## API

```ts
interface PresetOverwriteOptions {
  css?: string | (() => string)
  customCss?: boolean | CustomCssOptions
}

interface CustomCssOptions {
  layerName?: string
  layerIndex?: number
  layers?: CustomCssLayerConfig
}

interface CustomCssLayerConfig {
  preserve?: string[]
  default?: string[] // default: CUSTOM_CSS_DEFAULT_LAYERS
  skip?: string[]
}
```

| `customCss` | Behavior |
|-------------|----------|
| omitted / `true` / `{}` | Append static CSS (`preset-overwrite-custom` layer) |
| `false` | Safelist only |
| `{ layerName, layerIndex, layers }` | Overrides for output layer and inclusion rules |

## Utility functions

```ts
import { createGenerator } from 'unocss'
import {
  CUSTOM_CSS_DEFAULT_LAYERS,
  extractCustomCssFromCss,
  extractUnoClassTokensFromCss,
  resolveCustomCssLayers,
} from 'unocss-preset-overwrite'

const uno = await createGenerator({ /* same config as overwrite */ })

const tokens = extractUnoClassTokensFromCss(previousCompiledCss)

const staticCss = await extractCustomCssFromCss(previousCompiledCss, {
  generator: uno, // required for layers.default filtering
  layers: {
    preserve: ['palette'],
    default: [...CUSTOM_CSS_DEFAULT_LAYERS],
    skip: ['theme'],
  },
})
```

Also exported: `createUnoUtilityRuleMatcher`, `extractTokensFromSelector`, `resolveCustomCssLayers`, types `CustomCssLayerConfig`, `ExtractCustomCssOptions`.

`presetOverwrite` passes `ctx.generator` and `customCss.layers` to `extractCustomCssFromCss` in the preflight automatically.

## Notes

- **Safelist extraction** skips `base`, `theme`, and `properties` layers when layer markers exist (avoids false attributify matches from preflight selectors).
- **`customCss`** requires layer markers; plain CSS without them only contributes safelist tokens.
- **`layers.default`** needs the same `UnoGenerator` config as the overwrite run (`parseToken` / `generate`). Without `generator`, only `preserve`, pre-layer CSS, and static regions are collected.
- **`layers.skip`** overrides `preserve` and `default` for the same layer name.
- Output quality depends on how complete your previous compiled CSS is.

## License

[MIT](./LICENSE) License © 2026 [chizuki](https://github.com/chizukicn)
