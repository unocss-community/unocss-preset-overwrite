import type { UnoGenerator } from '@unocss/core'
import type { Rule } from 'postcss'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** Layers to skip: preflight/base CSS should not contribute utility tokens (avoids false attributify matches). */
const SKIP_LAYERS = new Set(['base', 'theme', 'properties'])

/** Layer names filtered by generator when `layers.default` is omitted. */
export const CUSTOM_CSS_DEFAULT_LAYERS = ['default', 'utilities', 'shortcuts'] as const

export interface CustomCssLayerConfig {
  /**
   * Entire layer content is appended to custom CSS as-is (e.g. `palette` to keep compiled `:root` vars).
   */
  preserve?: string[]
  /**
   * Layers where only rules the generator does not recognize as Uno utilities are kept
   * (requires `generator`).
   *
   * @default {@link CUSTOM_CSS_DEFAULT_LAYERS}
   */
  default?: string[]
  /**
   * Never include these layers in custom CSS (wins over `preserve` and `default`).
   */
  skip?: string[]
}

export interface ResolvedCustomCssLayers {
  preserve: Set<string>
  default: Set<string>
  skip: Set<string>
}

export function resolveCustomCssLayers(config?: CustomCssLayerConfig): ResolvedCustomCssLayers {
  return {
    preserve: new Set(config?.preserve ?? []),
    default: new Set(config?.default ?? CUSTOM_CSS_DEFAULT_LAYERS),
    skip: new Set(config?.skip ?? []),
  }
}

const LAYER_LINE_RE = /^layer:\s*(\S+)/
const ROOT_LAYER_MARKER_RE = /^\s*layer:\s*\S+/
/** Start collecting static CSS even inside Uno layer blocks (until the next `layer:` comment). */
const STATIC_REGION_RE = /^@unocss-preset-overwrite:static$/

export function extractFromSelector(sel: string, tokens: Set<string>) {
  if (!sel)
    return
  for (const token of extractTokensFromSelector(sel))
    tokens.add(token)
}

function walkForTokens(container: postcss.Container, layer: string | null, tokens: Set<string>) {
  let currentLayer = layer
  const nodes = container.nodes ?? []

  for (const node of nodes) {
    if (node.type === 'comment') {
      const m = node.text.trim().match(LAYER_LINE_RE)
      if (m)
        currentLayer = m[1]!
    }
    else if (node.type === 'rule') {
      if (currentLayer && !SKIP_LAYERS.has(currentLayer))
        extractFromSelector(node.selector, tokens)
    }
    else if (node.type === 'atrule') {
      walkForTokens(node, currentLayer, tokens)
    }
  }
}

export interface ExtractCustomCssOptions {
  /**
   * UnoCSS generator (same config as the overwrite run). Used for `layers.default` matching
   * via `parseToken` / `generate`.
   */
  generator?: UnoGenerator
  /** Which input layers contribute to custom CSS output. */
  layers?: CustomCssLayerConfig
}

async function shouldCollectRule(
  rule: Rule,
  currentLayer: string | null,
  staticRegion: boolean,
  layers: ResolvedCustomCssLayers,
  isUnoUtilityRule?: UnoUtilityRuleMatcher,
): Promise<boolean> {
  if (!currentLayer || staticRegion)
    return true
  if (layers.skip.has(currentLayer))
    return false
  if (layers.preserve.has(currentLayer))
    return true
  if (layers.default.has(currentLayer)) {
    if (!isUnoUtilityRule)
      return false
    return !(await isUnoUtilityRule(rule))
  }
  return false
}

async function collectCustomRulesFromAtRule(
  atRule: postcss.AtRule,
  currentLayer: string | null,
  staticRegion: boolean,
  layers: ResolvedCustomCssLayers,
  out: postcss.ChildNode[],
  isUnoUtilityRule?: UnoUtilityRuleMatcher,
) {
  const customChildren: postcss.ChildNode[] = []

  for (const child of atRule.nodes ?? []) {
    if (child.type === 'rule') {
      if (await shouldCollectRule(child, currentLayer, staticRegion, layers, isUnoUtilityRule))
        customChildren.push(child.clone())
    }
    else if (child.type === 'atrule') {
      await collectCustomRulesFromAtRule(child, currentLayer, staticRegion, layers, customChildren, isUnoUtilityRule)
    }
  }

  if (customChildren.length === 0)
    return

  const clone = atRule.clone()
  clone.removeAll()
  for (const child of customChildren)
    clone.append(child)
  out.push(clone)
}

async function collectCustomCssNodes(
  container: postcss.Container,
  layer: string | null,
  out: postcss.ChildNode[],
  forceStatic: boolean,
  layers: ResolvedCustomCssLayers,
  isUnoUtilityRule?: UnoUtilityRuleMatcher,
) {
  let currentLayer = layer
  let staticRegion = forceStatic
  const nodes = container.nodes ?? []

  for (const node of nodes) {
    if (node.type === 'comment') {
      const text = node.text.trim()
      if (STATIC_REGION_RE.test(text)) {
        staticRegion = true
        continue
      }
      const m = text.match(LAYER_LINE_RE)
      if (m) {
        staticRegion = false
        currentLayer = m[1]!
        continue
      }
      if (!currentLayer || staticRegion)
        out.push(node.clone())
    }
    else if (node.type === 'rule') {
      if (await shouldCollectRule(node, currentLayer, staticRegion, layers, isUnoUtilityRule))
        out.push(node.clone())
    }
    else if (node.type === 'atrule') {
      if (currentLayer && layers.skip.has(currentLayer))
        continue
      if (!currentLayer || staticRegion || layers.preserve.has(currentLayer!))
        out.push(node.clone())
      else if (layers.default.has(currentLayer!))
        await collectCustomRulesFromAtRule(node, currentLayer, staticRegion, layers, out, isUnoUtilityRule)
    }
  }
}

function rootDeclaresLayers(root: postcss.Root): boolean {
  let found = false
  root.walkComments((c) => {
    if (ROOT_LAYER_MARKER_RE.test(c.text.trim()))
      found = true
  })
  return found
}

/**
 * Parse Uno-compatible tokens from a CSS string:
 *
 * - **class**: names from `.utility`, including escapes as in Uno output (e.g. `hover:bg-red-500`).
 * - **Attributify** (`@unocss/preset-attributify`): selectors like `[bg~="red-500"]`, `[flex=""]`,
 *   `[un-bg~="red-500"]` are kept verbatim when they match the same attributify pattern as @unocss/core.
 *
 * If the file contains Uno layer markers (block comments whose text starts with `layer:`), only
 * rules in layers other than `base`, `theme`, and `properties` are scanned—so preflight selectors
 * like `[type="button"]` are not picked up as utilities.
 *
 * Callers pass the full CSS string; no filesystem I/O. Compound class selectors may yield extra
 * tokens; filter upstream if needed.
 */
export function extractUnoClassTokensFromCss(css: string): string[] {
  const trimmed = css.trim()
  if (!trimmed)
    return []

  let root: postcss.Root
  try {
    root = postcss.parse(trimmed, { from: undefined })
  }
  catch {
    return []
  }

  const tokens = new Set<string>()

  if (rootDeclaresLayers(root))
    walkForTokens(root, null, tokens)
  else
    root.walkRules(rule => extractFromSelector(rule.selector, tokens))

  return [...tokens]
}

/**
 * Return custom CSS from a compiled Uno CSS string.
 *
 * - Rules **before** the first `layer:` comment, or inside a `@unocss-preset-overwrite:static` region.
 * - Rules in `layers.default` ({@link CUSTOM_CSS_DEFAULT_LAYERS} when omitted) that the generator
 *   does not recognize as Uno utilities.
 * - Entire layers listed in `layers.preserve`.
 * - Layers in `layers.skip` are never included (overrides `preserve` / `default`).
 *
 * Pass the same `UnoGenerator` instance (config) used for the overwrite run. Without it, only
 * blocks outside layer markers / static regions / `layers.preserve` are collected.
 *
 * Requires layer markers; otherwise returns an empty string.
 */
export async function extractCustomCssFromCss(
  css: string,
  options?: ExtractCustomCssOptions,
): Promise<string> {
  const trimmed = css.trim()
  if (!trimmed)
    return ''

  let root: postcss.Root
  try {
    root = postcss.parse(trimmed, { from: undefined })
  }
  catch {
    return ''
  }

  if (!rootDeclaresLayers(root))
    return ''

  const layers = resolveCustomCssLayers(options?.layers)
  const isUnoUtilityRule = options?.generator
    ? createUnoUtilityRuleMatcher(options.generator)
    : undefined

  const nodes: postcss.ChildNode[] = []
  await collectCustomCssNodes(root, null, nodes, false, layers, isUnoUtilityRule)
  if (nodes.length === 0)
    return ''

  const out = postcss.root()
  for (const node of nodes)
    out.append(node)

  return out.toString().trim()
}

/** Same regex shape as `isAttributifySelector` in @unocss/core. */
const ATTRIBUTIFY_SELECTOR_RE = /^\[.+?~?=".*"\]$/

export function extractTokensFromSelector(selector: string): string[] {
  const tokens: string[] = []
  if (!selector)
    return tokens
  if (ATTRIBUTIFY_SELECTOR_RE.test(selector.trim())) {
    tokens.push(selector.trim())
    return tokens
  }
  try {
    selectorParser((selectors) => {
      selectors.walkClasses(classNode => void tokens.push(classNode.value))
      selectors.walkAttributes((attr) => {
        const op = attr.operator
        if (op !== '~=' && op !== '=')
          return
        const name = attr.attribute
        const val = attr.value ?? ''
        tokens.push(op === '~=' ? `[${name}~="${val}"]` : `[${name}="${val}"]`)
      })
    }).processSync(selector)
  }
  catch {
    // Invalid selector; skip.
  }
  return tokens
}

function selectorPartsAppearInCss(selector: string, css: string): boolean {
  const parts = selector.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0)
    return false

  const hit = new Set<string>()
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selector)
      return
    for (const part of rule.selector.split(',').map(s => s.trim())) {
      if (parts.includes(part))
        hit.add(part)
    }
  })
  return hit.size === parts.length
}

export type UnoUtilityRuleMatcher = (rule: Rule) => Promise<boolean>

/**
 * Match compiled utility-layer rules against the active UnoCSS generator
 * ({@link UnoGenerator.parseToken} + {@link UnoGenerator.generate}).
 */
export function createUnoUtilityRuleMatcher(generator: UnoGenerator): UnoUtilityRuleMatcher {
  const cache = new Map<string, boolean>()

  return async (rule: Rule): Promise<boolean> => {
    const cacheKey = rule.toString()
    const cached = cache.get(cacheKey)
    if (cached !== undefined)
      return cached

    const selector = rule.selector ?? ''
    if (!selector) {
      cache.set(cacheKey, false)
      return false
    }

    const tokens = extractTokensFromSelector(selector)
    if (tokens.length === 0) {
      cache.set(cacheKey, false)
      return false
    }

    const parsedTokens: string[] = []
    for (const token of tokens) {
      const util = await generator.parseToken(token)
      if (util?.length)
        parsedTokens.push(token)
    }

    if (parsedTokens.length === 0) {
      cache.set(cacheKey, false)
      return false
    }

    const { css } = await generator.generate(parsedTokens.join(' '), {
      preflights: false,
      safelist: false,
    })

    const result = !!css.trim() && selectorPartsAppearInCss(selector, css)
    cache.set(cacheKey, result)
    return result
  }
}
