import type { Preset } from 'unocss'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { describe, expect, it } from 'vitest'
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

it('extractCustomCssFromCss: keeps rules outside Uno layer blocks', () => {
  const custom = extractCustomCssFromCss(mixedCss)
  expect(custom).toContain('.my-custom')
  expect(custom).toContain('color: blue')
  expect(custom).not.toContain('layer:')
  expect(custom).not.toContain('.flex')
})

it('extractUnoClassTokensFromCss: still ignores non-layer static selectors', () => {
  expect(extractUnoClassTokensFromCss(mixedCss).sort()).toEqual(['flex', 'text-sm'])
})

it('extractCustomCssFromCss: empty when no layer markers', () => {
  const css = '.foo { color: red; }'
  expect(extractCustomCssFromCss(css)).toBe('')
  expect(extractUnoClassTokensFromCss(css)).toEqual(['foo'])
})

describe('extractCustomCssFromCss: complex custom selectors', () => {
  it('preserves @media with nested rules and pseudo-classes', () => {
    const css = `
@media (min-width: 768px) {
  .sidebar { width: 200px; }
  .sidebar:hover { opacity: 0.9; }
}
@media print {
  .no-print { display: none !important; }
}
${LAYER_TAIL}`
    const custom = extractCustomCssFromCss(css)
    expect(custom).toContain('@media (min-width: 768px)')
    expect(custom).toContain('.sidebar:hover')
    expect(custom).toContain('@media print')
    expect(custom).toContain('display: none')
    expect(custom).not.toContain('.flex')
  })

  it('preserves @supports, @container, @keyframes, and @font-face', () => {
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
    const custom = extractCustomCssFromCss(css)
    expect(custom).toContain('@supports (display: grid)')
    expect(custom).toContain('@container card (min-width: 400px)')
    expect(custom).toContain('@keyframes fade-in')
    expect(custom).toContain('@font-face')
    expect(custom).toContain('format("woff2")')
  })

  it('preserves compound and functional selectors', () => {
    const css = `
:is(.a, .b) > .c[data-x="1"]:not(:first-child) { color: red; }
.parent .child::before { content: ""; }
#app [data-theme="dark"] .title { font-weight: 700; }
${LAYER_TAIL}`
    const custom = extractCustomCssFromCss(css)
    expect(custom).toContain(':is(.a, .b)')
    expect(custom).toContain('[data-x="1"]')
    expect(custom).toContain(':not(:first-child)')
    expect(custom).toContain('.parent .child::before')
    expect(custom).toContain('[data-theme="dark"]')
  })

  it('preserves nested @media inside a static @layer block', () => {
    const css = `
@layer components {
  .card { padding: 1rem; }
  @media (min-width: 640px) {
    .card { padding: 2rem; }
  }
}
${LAYER_TAIL}`
    const custom = extractCustomCssFromCss(css)
    expect(custom).toContain('@layer components')
    expect(custom).toContain('@media (min-width: 640px)')
    expect(custom).toContain('.card')
  })

  it('static marker: preserves @media appended after Uno layers', () => {
    const css = `
/* layer: utilities */
.flex { display: flex; }
/* @unocss-preset-overwrite:static */
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
`
    const custom = extractCustomCssFromCss(css)
    expect(custom).toContain('@media (min-width: 48rem)')
    expect(custom).toContain('.trailing')
    expect(custom).not.toContain('.flex')
  })

  it('without static marker: trailing @media after layers is not collected', () => {
    const css = `
/* layer: utilities */
.flex { display: flex; }
@media (min-width: 48rem) {
  .trailing { margin: auto; }
}
`
    expect(extractCustomCssFromCss(css)).toBe('')
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
