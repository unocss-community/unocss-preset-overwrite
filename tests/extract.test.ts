import type { Preset } from 'unocss'
import presetAttributify from '@unocss/preset-attributify'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { expect, it } from 'vitest'
import { extractUnoClassTokensFromCss, presetOverwrite } from '../src'

/** Common utilities: layout, spacing, typography, color, radius, shadow, hover, responsive. */
const COMMON_UTILITIES = [
  'flex',
  'items-center',
  'justify-between',
  'gap-4',
  'p-4',
  'm-2',
  'w-full',
  'max-w-md',
  'text-sm',
  'font-medium',
  'text-zinc-900',
  'rounded-lg',
  'shadow',
  'hover:opacity-80',
  'md:grid-cols-2',
].join(' ')

it('extractUnoClassTokensFromCss: plain and comma selectors', () => {
  const css = `
    .foo { color: red; }
    .bar, .baz:hover { margin: 0; }
  `
  expect(extractUnoClassTokensFromCss(css).sort()).toEqual(['bar', 'baz', 'foo'])
})

it('extractUnoClassTokensFromCss: Uno-like escapes in selectors', () => {
  const css = `
    .col-1 { width: 10%; }
    .hover\\:bg-red-500:hover { color: red; }
  `
  expect(extractUnoClassTokensFromCss(css).sort()).toEqual(['col-1', 'hover:bg-red-500'])
})

it('extractUnoClassTokensFromCss: preset-attributify selectors (~= and empty value)', () => {
  const css = `
    [bg~="red-500"] { background: red; }
    [flex=""] { display: flex; }
    [bg~="hover\\:blue-400"]:hover { background: blue; }
  `
  expect(extractUnoClassTokensFromCss(css).sort()).toEqual([
    '[bg~="hover:blue-400"]',
    '[bg~="red-500"]',
    '[flex=""]',
  ])
})

it('extractUnoClassTokensFromCss: presetWind4 output includes common class tokens', async () => {
  const uno = await createGenerator({
    presets: [presetWind4()],
  })
  const { css } = await uno.generate(COMMON_UTILITIES)
  const tokens = new Set(extractUnoClassTokensFromCss(css))

  for (const util of COMMON_UTILITIES.split(/\s+/))
    expect(tokens, `missing token: ${util}`).toContain(util)
})

it('presetWind4 + presetOverwrite: safelist from CSS string regenerates common utilities', async () => {
  const unoPrev = await createGenerator({
    presets: [presetWind4()],
  })
  const { css: compiled } = await unoPrev.generate(COMMON_UTILITIES)

  const uno = await createGenerator({
    presets: [
      presetWind4(),
      presetOverwrite({ css: compiled }),
    ] as Preset<any>[],
  })
  const { css } = await uno.generate('')

  expect(css).toMatch(/\.flex\{[^}]*display:\s*flex/)
  expect(css).toMatch(/\.text-sm\{/)
  expect(css).toMatch(/\.text-zinc-900\{/)
  expect(css).toMatch(/\.md\\:grid-cols-2\{/)
  expect(css).toMatch(/@media\s*\(min-width:\s*48rem\)/)
})

it('presetWind4: compiled CSS can be recompiled with a new theme via presetOverwrite', async () => {
  const themeA = { colors: { red: { 500: 'rgb(255 0 0)' } } }
  const themeB = { colors: { red: { 500: 'rgb(0 255 0)' } } }

  const compile = await createGenerator({
    presets: [presetWind4()] as Preset<any>[],
    theme: themeA,
  })
  const { css: compiled } = await compile.generate('text-red-500')
  expect(compiled).toContain('--colors-red-500: rgb(255 0 0)')

  const recompile = await createGenerator({
    presets: [presetWind4(), presetOverwrite({ css: compiled })] as Preset<any>[],
    theme: themeB,
  })
  const { css: out } = await recompile.generate('')

  expect(out).toContain('--colors-red-500: rgb(0 255 0)')
  expect(out).not.toContain('--colors-red-500: rgb(255 0 0)')
  expect(out).toMatch(/\.text-red-500\{/)
})

it('presetWind4 + preset-attributify: compiled CSS regenerates with new theme via presetOverwrite', async () => {
  const ATTR_INPUT = new Set([
    '[bg~="red-500"]',
    '[text~="sm"]',
    '[flex=""]',
  ])

  const themeA = { colors: { red: { 500: 'rgb(255 0 0)' } } }
  const themeB = { colors: { red: { 500: 'rgb(0 128 255)' } } }

  const compile = await createGenerator({
    presets: [presetWind4(), presetAttributify()] as Preset<any>[],
    theme: themeA,
  })
  const { css: compiled } = await compile.generate(ATTR_INPUT)
  expect(compiled).toContain('[bg~="red-500"]')
  expect(compiled).toContain('--colors-red-500: rgb(255 0 0)')

  const extracted = extractUnoClassTokensFromCss(compiled)
  for (const t of ATTR_INPUT)
    expect(extracted).toContain(t)

  const recompile = await createGenerator({
    presets: [presetWind4(), presetAttributify(), presetOverwrite({ css: compiled })] as Preset<any>[],
    theme: themeB,
  })
  const { css: out } = await recompile.generate('')

  expect(out).toContain('--colors-red-500: rgb(0 128 255)')
  expect(out).toContain('[bg~="red-500"]')
  expect(out).toContain('[text~="sm"]')
  expect(out).toContain('[flex=""]')
})
