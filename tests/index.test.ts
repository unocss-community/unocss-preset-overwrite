import type { Preset } from 'unocss'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { expect, it } from 'vitest'
import { presetOverwrite } from '../src'

it('presetOverwrite factory returns only name and safelist; restores wind4 utilities from CSS', async () => {
  expect(Object.keys(presetOverwrite({ css: '.x{}' })).sort()).toEqual(['name', 'safelist'])
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
