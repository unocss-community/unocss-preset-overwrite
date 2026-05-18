import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** Same regex shape as `isAttributifySelector` in @unocss/core (capturing groups required). */
const ATTRIBUTIFY_SELECTOR_RE = /^\[.+?~?=".*"\]$/
function isAttributifyToken(selector: string): boolean {
  return ATTRIBUTIFY_SELECTOR_RE.test(selector)
}

/** Layers to skip: preflight/base CSS should not contribute utility tokens (avoids false attributify matches). */
const SKIP_LAYERS = new Set(['base', 'theme', 'properties'])

const LAYER_LINE_RE = /^layer:\s*(\S+)/
const ROOT_LAYER_MARKER_RE = /^\s*layer:\s*\S+/
/** Start collecting static CSS even inside Uno layer blocks (until the next `layer:` comment). */
const STATIC_REGION_RE = /^@unocss-preset-overwrite:static$/

function attributifyTokenFromAttribute(
  attr: selectorParser.Attribute,
): string | null {
  const op = attr.operator
  if (op !== '~=' && op !== '=')
    return null
  const name = attr.attribute
  const val = attr.value ?? ''
  if (op === '~=')
    return `[${name}~="${val}"]`
  return `[${name}="${val}"]`
}

function extractFromSelector(sel: string, tokens: Set<string>) {
  if (!sel)
    return
  try {
    selectorParser((selectors) => {
      selectors.walkClasses((classNode) => {
        tokens.add(classNode.value)
      })
      selectors.walkAttributes((attr) => {
        const raw = attributifyTokenFromAttribute(attr)
        if (raw && isAttributifyToken(raw))
          tokens.add(raw)
      })
    }).processSync(sel)
  }
  catch {
    // Invalid selector; skip.
  }
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

function collectCustomCssNodes(
  container: postcss.Container,
  layer: string | null,
  out: postcss.ChildNode[],
  forceStatic = false,
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
    else if (node.type === 'rule' || node.type === 'decl') {
      if (!currentLayer || staticRegion)
        out.push(node.clone())
    }
    else if (node.type === 'atrule') {
      if (!currentLayer || staticRegion)
        out.push(node.clone())
      else
        collectCustomCssNodes(node, currentLayer, out)
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
 * Return CSS that sits outside Uno `layer:` blocks (e.g. custom rules before/after compiled output).
 *
 * Requires layer markers in the input; otherwise returns an empty string.
 *
 * Custom CSS appended after Uno layers can be marked with a block comment:
 * `/* @unocss-preset-overwrite:static *\/` — everything until the next `layer:` comment is preserved.
 */
export function extractCustomCssFromCss(css: string): string {
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

  const nodes: postcss.ChildNode[] = []
  collectCustomCssNodes(root, null, nodes)
  if (nodes.length === 0)
    return ''

  const out = postcss.root()
  for (const node of nodes)
    out.append(node)

  return out.toString().trim()
}
