import type { Rule } from 'postcss'
import type { UnoUtilityRuleMatcher } from '../src'
import postcss from 'postcss'
import { createGenerator } from 'unocss'
import presetWind4 from 'unocss/preset-wind4'
import { beforeAll, expect, it } from 'vitest'
import { createUnoUtilityRuleMatcher } from '../src'

let isUnoUtilityRule: UnoUtilityRuleMatcher

beforeAll(async () => {
  const uno = await createGenerator({ presets: [presetWind4()] })
  isUnoUtilityRule = createUnoUtilityRuleMatcher(uno)
})

function rule(css: string) {
  return postcss.parse(css).first as Rule
}

it('createUnoUtilityRuleMatcher: recognizes Uno utilities', async () => {
  expect(await isUnoUtilityRule(rule('.flex{display:flex}'))).toBe(true)
  expect(await isUnoUtilityRule(rule('.text-sm{font-size:1rem}'))).toBe(true)
})

it('createUnoUtilityRuleMatcher: rejects non-utility rules', async () => {
  expect(await isUnoUtilityRule(rule('.chat-box[data-v-abc]{margin:1rem}'))).toBe(false)
  expect(await isUnoUtilityRule(rule('.splitpanes__splitter{background:red}'))).toBe(false)
})
