import type { Preset, UnoGenerator } from 'unocss'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractCustomCssFromCss, extractUnoClassTokensFromCss, presetOverwrite } from '../src'

const LAYER_TAIL = `
/* layer: theme */
:root { --x: 1; }
/* layer: utilities */
.flex { display: flex; }
`

const mixedCss = `
.my-custom { color: blue; padding: 20px; }

/* layer: theme */
:root { --x: 1; }
/* layer: base */
*, ::before { box-sizing: border-box; }
/* layer: properties */
@property --p { syntax: "*"; inherits: false; initial-value: 0; }
/* layer: utilities */
.flex { display: flex; }
.text-sm { font-size: 0.875rem; }
`

let wind4: UnoGenerator

beforeAll(async () => {
  wind4 = await createGenerator({ presets: [presetWind4()] })
})

function withWind4(css: string) {
  return extractCustomCssFromCss(css, { generator: wind4 })
}

it('extractCustomCssFromCss: keeps rules outside Uno layer blocks', async () => {
  const custom = await extractCustomCssFromCss(mixedCss)
  expect(custom).toContain('.my-custom')
  expect(custom).toContain('color: blue')
  expect(custom).not.toContain('layer:')
  expect(custom).not.toContain('.flex')
})

it('extractUnoClassTokensFromCss: still ignores non-layer static selectors', () => {
  expect(extractUnoClassTokensFromCss(mixedCss).sort()).toEqual(['flex', 'text-sm'])
})

it('extractCustomCssFromCss: empty when no layer markers', async () => {
  const css = '.foo { color: red; }'
  expect(await extractCustomCssFromCss(css)).toBe('')
  expect(extractUnoClassTokensFromCss(css)).toEqual(['foo'])
})

describe('extractCustomCssFromCss: complex custom selectors', () => {
  it('preserves @media with nested rules and pseudo-classes', async () => {
    const css = `
@media (min-width: 768px) {
  .sidebar { width: 200px; }
  .sidebar:hover { opacity: 0.9; }
}
@media print {
  .no-print { display: none !important; }
}
${LAYER_TAIL}`
    const custom = await extractCustomCssFromCss(css)
    expect(custom).toContain('@media (min-width: 768px)')
    expect(custom).toContain('.sidebar:hover')
    expect(custom).toContain('@media print')
    expect(custom).toContain('display: none')
    expect(custom).not.toContain('.flex')
  })

  it('preserves @supports, @container, @keyframes, and @font-face', async () => {
    const css = `
@supports (display: grid) {
  .grid-fallback { display: grid; }
}
@container card (min-width: 400px) {
  .card-body { padding: 2rem; }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@font-face {
  font-family: "Custom";
  src: url("/fonts/custom.woff2") format("woff2");
}
${LAYER_TAIL}`
    const custom = await extractCustomCssFromCss(css)
    expect(custom).toContain('@supports (display: grid)')
    expect(custom).toContain('@container card (min-width: 400px)')
    expect(custom).toContain('@keyframes fade-in')
    expect(custom).toContain('@font-face')
    expect(custom).toContain('format("woff2")')
  })

  it('preserves compound and functional selectors', async () => {
    const css = `
:is(.a, .b) > .c[data-x="1"]:not(:first-child) { color: red; }
.parent .child::before { content: ""; }
#app [data-theme="dark"] .title { font-weight: 700; }
${LAYER_TAIL}`
    const custom = await extractCustomCssFromCss(css)
    expect(custom).toContain(':is(.a, .b)')
    expect(custom).toContain('[data-x="1"]')
    expect(custom).toContain(':not(:first-child)')
    expect(custom).toContain('.parent .child::before')
    expect(custom).toContain('[data-theme="dark"]')
  })

  it('preserves nested @media inside a static @layer block', async () => {
    const css = `
@layer components {
  .card { padding: 1rem; }
  @media (min-width: 640px) {
    .card { padding: 2rem; }
  }
}
${LAYER_TAIL}`
    const custom = await extractCustomCssFromCss(css)
    expect(custom).toContain('@layer components')
    expect(custom).toContain('@media (min-width: 640px)')
    expect(custom).toContain('.card')
  })

  it('static marker: preserves @media appended after Uno layers', async () => {
    const css = `
/* layer: utilities */
.flex { display: flex; }
/* @unocss-preset-overwrite:static */
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
`
    const custom = await extractCustomCssFromCss(css)
    expect(custom).toContain('@media (min-width: 48rem)')
    expect(custom).toContain('.trailing')
    expect(custom).not.toContain('.flex')
  })

  it('utility layer: non-utility @media after utilities is collected with generator', async () => {
    const css = `
/* layer: utilities */
.flex { display: flex; }
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
`
    const custom = await withWind4(css)
    expect(custom).toContain('@media (min-width: 48rem)')
    expect(custom).toContain('.trailing')
    expect(custom).not.toContain('.flex')
  })

  it('utility layer: @media with only utility rules is not custom CSS', async () => {
    const { css: compiled } = await wind4.generate('container md:p-4', { preflights: false })
    const css = `/* layer: shortcuts */\n${compiled}`
    expect(await withWind4(css)).toBe('')
  })

  it('layers.preserve: entire layer is custom CSS', async () => {
    const css = `
/* layer: palette */
:root { --color-primary-rgb: 78 107 239; --color-back-rgb: 255 255 255; }
/* layer: default */
.flex { display: flex; }
`
    const custom = await extractCustomCssFromCss(css, {
      generator: wind4,
      layers: { preserve: ['palette'] },
    })
    expect(custom).toContain('--color-primary-rgb: 78 107 239')
    expect(custom).not.toMatch(/\.flex\s*\{/)
  })

  it('layers.skip: excludes layer from default filter list', async () => {
    const css = `
/* layer: default */
.component-only { padding: 1rem; }
.flex { display: flex; }
`
    const custom = await extractCustomCssFromCss(css, {
      generator: wind4,
      layers: { skip: ['default'] },
    })
    expect(custom).toBe('')
  })

  it('layers.skip overrides preserve', async () => {
    const css = `
/* layer: palette */
:root { --color-x: 1; }
`
    const custom = await extractCustomCssFromCss(css, {
      layers: { preserve: ['palette'], skip: ['palette'] },
    })
    expect(custom).toBe('')
  })

  it('layers.default override: only listed layers are filtered', async () => {
    const css = `
/* layer: palette */
:root { --color-x: 1; }
/* layer: default */
.component-only { padding: 1rem; }
.flex { display: flex; }
`
    const custom = await extractCustomCssFromCss(css, {
      generator: wind4,
      layers: { default: ['default'], preserve: ['palette'] },
    })
    expect(custom).toContain('--color-x: 1')
    expect(custom).toContain('.component-only')
    expect(custom).not.toMatch(/\.flex\s*\{/)
  })

  it('default layer: non-utility rules are custom CSS', async () => {
    const css = `
/* layer: default */
.flex { display: flex; }
.chat-box-monaco-code[data-v-abc123] {
  margin-block: 0.5rem;
}
.splitpanes__splitter {
  background: rgb(var(--color-boundary));
}
`
    const custom = await withWind4(css)
    expect(custom).not.toMatch(/\.flex\s*\{/)
    expect(custom).toContain('[data-v-abc123]')
    expect(custom).toContain('.splitpanes__splitter')
  })
})

it('presetOverwrite customCss: preserves static CSS in generated output', async () => {
  const unoPrev = await createGenerator({ presets: [presetWind4()] })
  const { css: compiled } = await unoPrev.generate('flex text-sm')

  const input = `.legacy { margin: 1rem; }\n${compiled}`

  const without = await createGenerator({
    presets: [presetWind4(), presetOverwrite({ css: input, customCss: false })] as Preset<any>[],
  })
  expect((await without.generate('')).css).not.toContain('.legacy')

  const withCustom = await createGenerator({
    presets: [presetWind4(), presetOverwrite({ css: input })] as Preset<any>[],
  })
  const { css } = await withCustom.generate('')
  expect(css).toMatch(/\.flex\{/)
  expect(css).toContain('.legacy')
  expect(css).toContain('margin: 1rem')
})

it('presetOverwrite customCss: preserves @media and compound selectors', async () => {
  const unoPrev = await createGenerator({ presets: [presetWind4()] })
  const { css: compiled } = await unoPrev.generate('flex')

  const customBlock = `
@media (min-width: 40rem) {
  :is(.nav, .footer) a[href^="/"] { text-decoration: underline; }
}
@supports (backdrop-filter: blur(1px)) {
  .glass { backdrop-filter: blur(8px); }
}
`
  const input = `${customBlock}\n${compiled}`

  const uno = await createGenerator({
    presets: [
      presetWind4(),
      presetOverwrite({ css: input }),
    ] as Preset<any>[],
  })
  const { css } = await uno.generate('')

  expect(css).toMatch(/\.flex\{/)
  expect(css).toContain('@media (min-width: 40rem)')
  expect(css).toContain(':is(.nav, .footer)')
  expect(css).toContain('@supports (backdrop-filter: blur(1px))')
  expect(css).toContain('backdrop-filter: blur(8px)')
})
