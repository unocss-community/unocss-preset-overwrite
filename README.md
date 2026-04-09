# unocss-preset-overwrite [![npm](https://img.shields.io/npm/v/unocss-preset-overwrite)](https://npmjs.com/package/unocss-preset-overwrite)

Rebuild UnoCSS output with a new theme while keeping the same tokens.

This preset parses selectors from a previously generated CSS string and feeds them back into UnoCSS through `safelist`.

## Why

When you only have compiled CSS (instead of source templates), switching theme values usually requires regenerating the same utility tokens.

`unocss-preset-overwrite` helps by:

- extracting class tokens (e.g. `.text-red-500`, `.md\:grid-cols-2`)
- extracting attributify tokens (e.g. `[bg~="red-500"]`, `[flex=""]`)
- safelisting those tokens for the next UnoCSS run

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
    presetOverwrite({
      css,
    }),
  ],
})
```

### API

```ts
interface PresetOverwriteOptions {
  css?: string | (() => string)
}
```

- `css` can be:
  - a plain CSS string
  - a callback returning a CSS string (useful when the value is lazily loaded)

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

## Utility function

You can also use the extractor directly:

```ts
import { extractUnoClassTokensFromCss } from 'unocss-preset-overwrite'

const tokens = extractUnoClassTokensFromCss(previousCompiledCss)
```

## Notes

- The extractor skips UnoCSS `base`, `theme`, and `properties` layers when layer markers are present, to avoid false positives from preflight selectors.
- Output quality depends on how complete your previous compiled CSS is.

## License

[MIT](./LICENSE) License © 2026 [chizuki](https://github.com/chizukicn)
