# unocss-preset-overwrite [![npm](https://img.shields.io/npm/v/unocss-preset-overwrite)](https://npmjs.com/package/unocss-preset-overwrite)

Rebuild UnoCSS output with a new theme while keeping the same tokens.

This preset parses selectors from a previously generated CSS string and feeds them back into UnoCSS through `safelist`. Custom static CSS (rules outside Uno `layer:` blocks) can be preserved in the output.

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

By default, `customCss` is enabled. Any CSS **outside** Uno `layer:` blocks in the input string is appended to the generated output (via a preflight). This includes `@media`, `@supports`, `@container`, `@keyframes`, `@font-face`, and complex selectors.

**Recommended:** place custom styles **before** the first `/* layer: … */` comment in your CSS file:

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

**After Uno layers:** prefix trailing custom CSS with a static-region marker:

```css
/* layer: utilities */
.flex { display: flex; }

/* @unocss-preset-overwrite:static */
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
```

Disable or customize via `customCss`:

```ts
presetOverwrite({
  css,
  customCss: false, // do not append static CSS
})

presetOverwrite({
  css,
  customCss: true, // enabled, default layer (same as omitting customCss)
})

presetOverwrite({
  css,
  customCss: {
    layerName: 'my-components',
    layerIndex: 100, // higher = later in output
  },
})
```

## API

```ts
interface PresetOverwriteOptions {
  /** Previously compiled CSS (string or lazy callback). */
  css?: string | (() => string)
  /**
   * Append non-Uno CSS from `css` to the output.
   * @default {} (enabled)
   */
  customCss?: boolean | CustomCssOptions
}

interface CustomCssOptions {
  /** @default 'preset-overwrite-custom' */
  layerName?: string
  /** @default 9999 */
  layerIndex?: number
}
```

| `customCss` | Behavior |
|-------------|----------|
| omitted / `true` / `{}` | Append static CSS with default layer |
| `false` | Safelist only; no static CSS appended |
| `{ layerName, layerIndex }` | Append with custom layer name and sort order |

## Utility functions

```ts
import {
  extractCustomCssFromCss,
  extractUnoClassTokensFromCss,
} from 'unocss-preset-overwrite'

// Uno utility tokens for safelist / debugging
const tokens = extractUnoClassTokensFromCss(previousCompiledCss)

// Static CSS outside Uno layer blocks (empty string if no layer markers)
const staticCss = extractCustomCssFromCss(previousCompiledCss)
```

## Notes

- When layer markers (`/* layer: … */`) are present, token extraction skips `base`, `theme`, and `properties` layers to avoid false positives from preflight selectors.
- `extractCustomCssFromCss` / `customCss` require layer markers in the input; plain CSS without them only contributes tokens via `extractUnoClassTokensFromCss`, not static append.
- Output quality depends on how complete your previous compiled CSS is.

## License

[MIT](./LICENSE) License © 2026 [chizuki](https://github.com/chizukicn)
