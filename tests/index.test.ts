import type { Preset } from 'unocss'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { expect, it } from 'vitest'
import { presetOverwrite } from '../src'

it('presetOverwrite factory returns name, safelist, and custom-css preflight by default; restores wind4 utilities from CSS', async () => {
  expect(Object.keys(presetOverwrite({ css: '.x{}' })).sort()).toEqual(['layers', 'name', 'preflights', 'safelist'])
  expect(presetOverwrite({ css: '.x{}' }).name).toBe('unocss-preset-overwrite')

  const unoPrev = await createGenerator({
    presets: [presetWind4()],
  })
  const { css: compiled } = await unoPrev.generate('flex text-sm p-4')

  const uno = await createGenerator({
    presets: [
      presetWind4(),
      presetOverwrite({ css: compiled }),
    ] as Preset<any>[],
  })

  const { css } = await uno.generate('')
  expect(css).toMatch(/\.flex\{/)
  expect(css).toMatch(/\.text-sm\{/)
  expect(css).toMatch(/\.p-4\{/)
})

it('presetOverwrite: customCss layerName and layerIndex', async () => {
  const unoPrev = await createGenerator({ presets: [presetWind4()] })
  const { css: compiled } = await unoPrev.generate('flex')
  const input = `.custom-layer-test { z-index: 1; }\n${compiled}`

  const preset = presetOverwrite({
    css: input,
    customCss: { layerName: 'my-static', layerIndex: 100 },
  })
  expect(preset.preflights?.[0]?.layer).toBe('my-static')
  expect(preset.layers).toEqual({ 'my-static': 100 })

  const uno = await createGenerator({
    presets: [presetWind4(), preset] as Preset<any>[],
  })
  const { css } = await uno.generate('')
  expect(css).toContain('.custom-layer-test')
  expect(css).toMatch(/\.flex\{/)
})

it('presetOverwrite: customCss true uses default preflight', async () => {
  const preset = presetOverwrite({ css: '.x{}', customCss: true })
  expect(preset.preflights?.[0]?.layer).toBe('preset-overwrite-custom')
  expect(preset.layers).toEqual({ 'preset-overwrite-custom': 9999 })
})
