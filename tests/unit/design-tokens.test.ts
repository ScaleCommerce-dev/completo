import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import {
  PRIORITIES,
  priorityTextClass,
  priorityBarClass,
  priorityChartClass,
  priorityUiColor,
  priorityIcon,
  priorityLabel,
  identityColor,
  IDENTITY_COLORS,
  COLOR_PALETTE
} from '../../app/utils/constants'

const ROOT = join(import.meta.dirname, '../..')

/**
 * sRGB ↔ Oklab, so a colour recipe in this stylesheet can be checked for contrast
 * rather than for spelling. Ottosson's matrices; the browser is doing exactly this
 * arithmetic, and reimplementing it here is what lets a declared lightness be
 * asserted against WCAG instead of against the previous declared lightness.
 *
 * `mixOklab` used to live here, next to a `BLACK` and a `WHITE` to mix toward. Both
 * went with the recipe: nothing mixes toward a base any more, because setting the
 * lightness is what made the output independent of the stored hue. `WHITE` stays —
 * light mode's page really is white, and `uiBg` reads the dark one out of the ramp.
 */
const WHITE: RGB = [1, 1, 1]

type RGB = [number, number, number]

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function toOklab([r, g, b]: RGB): RGB {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ]
}

function toRgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ].map(v => Math.min(1, Math.max(0, toGamma(v)))) as RGB
}

/** A stored hex's Oklch hue angle, in degrees. */
function hueOf(hex: string): number {
  const [, a, b] = toOklab([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB)

  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
}

function ratio(a: RGB, b: RGB): number {
  const lum = ([r, g, b2]: RGB) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b2)
  const [x, y] = [lum(a), lum(b)]

  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * The declaration block of one CSS rule, anchored to the start of a line and
 * stopping at that rule's own closing brace. The selector may be one entry of a
 * comma-separated list, which is how the tag pill's light-mode shares are
 * declared.
 *
 * Both halves of that are load-bearing rather than tidy.
 *
 * `.swatch-avatar` also appears as the last entry of the comma-separated list
 * that declares the shared defaults, and that list comes first in the file — an
 * unanchored match read the *tag pill's* 88%/13% and reported the avatar as
 * compliant at percentages it does not use.
 *
 * And a body of `[^}]*` cannot leave the rule. A `[\s\S]*?` search of the whole
 * file reached any of the thirty later `color-mix` calls and called the rule
 * under test present; the focus assertion it replaces was luckier still —
 * main.css contains exactly one `outline:`, so the unanchored version was
 * correct by accident rather than by construction, which is not a property to
 * inherit.
 */
function ruleBlock(css: string, selector: string): string {
  const esc = selector.replace(/[.()]/g, '\\$&')
  const block = css.match(new RegExp(`^${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm'))?.[1]
  expect(block, `no rule for \`${selector}\` at the start of a line`).toBeDefined()

  return block!
}

/**
 * One `oklch(from var(--swatch) L [calc(c * K)] h)` channel recipe: the lightness
 * this stylesheet forces, and how much of the source colour's chroma it keeps.
 *
 * Parsed rather than assumed, because the whole point of the recipe is that the
 * *lightness is ours and the hue is the user's*. The predecessor parsed
 * `color-mix(… var(--swatch) N%, black)` shares, and the reason that recipe was
 * replaced is exactly what a share-based reading cannot express: a mix's output
 * lightness depends on its input's, so a dark stored hex stayed dark however the
 * percentages were tuned, and `COLOR_PALETTE` deliberately offers eight dark ones.
 */
type Channel = { lightness: number, chroma: number }

function recipeFor(css: string, selector: string): { fg: Channel, fill: Channel, mark?: Channel } {
  const block = ruleBlock(css, selector)

  const channel = (name: string, required = true): Channel | undefined => {
    // `c` bare keeps the chroma; `calc(c * K)` scales it.
    const m = block.match(new RegExp(`--swatch-${name}: oklch\\(from var\\(--swatch\\) ([\\d.]+) (?:calc\\(c \\* ([\\d.]+)\\)|c) h\\)`))
    if (!required && !m) return undefined

    expect(m, `--swatch-${name} in \`${selector}\` is not an \`oklch(from var(--swatch) …)\` recipe`).not.toBeNull()

    return { lightness: Number(m![1]), chroma: m![2] === undefined ? 1 : Number(m![2]) }
  }

  return { fg: channel('fg')!, fill: channel('fill')!, mark: channel('mark', false) }
}

/** Apply a parsed channel recipe to a stored hex, the way the browser does. */
function applyChannel(hex: string, ch: Channel): RGB {
  const [, a, b] = toOklab([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB)
  const chroma = Math.hypot(a, b) * ch.chroma
  const hue = Math.atan2(b, a)

  return toRgb([ch.lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)])
}

/**
 * The page colour a mode paints, read out of the ramp `main.css` declares.
 *
 * Derived rather than restated: the contrast figures below are only meaningful
 * against the actual background, and a near-black hardcoded here would be a second
 * copy of a value the stylesheet owns — which is the defect that let the previous
 * contrast test measure the wrong rule and pass.
 */
function uiBg(css: string, selector: string): RGB {
  const m = ruleBlock(css, selector).match(/--ui-bg: oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/)
  expect(m, `--ui-bg in \`${selector}\``).not.toBeNull()

  const [L, C, H] = [Number(m![1]) / 100, Number(m![2]), Number(m![3]) * Math.PI / 180]

  return toRgb([L, C * Math.cos(H), C * Math.sin(H)])
}

function vueFiles(): string[] {
  return execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' }).trim().split('\n')
}

const blankLines = (text: string) => text.replace(/[^\n]/g, '')

/**
 * A source file with its comments blanked out, line numbering intact.
 *
 * The guards below look for class names that must not be there, and the prose
 * explaining why they must not be there names them. Stripping first is what
 * keeps `<!-- never reach for bg-zinc-500 -->` from reading as a violation of
 * itself — and the derivation of `NEUTRAL` below is the same mistake caught in
 * the act: matched against the whole of app.config it answered `slate`, out of
 * the header comment describing the bug.
 *
 * What survives is live: a `class` attribute, a `:class` expression, a class
 * name assembled in a `<script>` block, or a scoped `<style>`. All four are the
 * defect, so all four are read.
 */
function markup(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, blankLines)
    .replace(/\/\*[\s\S]*?\*\//g, blankLines)
    .replace(/^\s*\/\/.*$/gm, blankLines)
}

/**
 * These guard the design token layer the same way `list-fields.test.ts` guards
 * the list-column registry: the invariant is cheap to state and expensive to
 * rediscover.
 *
 * The app previously declared `primary: 'blue'` / `neutral: 'slate'` in
 * app.config while every hand-written utility used indigo and zinc. Nuxt UI
 * components rendered blue-on-slate beside indigo-on-zinc chrome, and since
 * slate carries ~7x the chroma of zinc at the same lightness, dark mode showed a
 * visible seam between the sidebar and the content area. Nothing caught it —
 * the integration suite talks HTTP to a built server and never mounts the app.
 */
const APP_CONFIG = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, blankLines)
  .replace(/^\s*\/\/.*$/gm, blankLines)

/** The `colors` block, which is the whole of the brand declaration. */
const BRAND = APP_CONFIG.match(/^\s*colors: \{([^}]*)\}/m)?.[1] ?? ''

/**
 * The neutral family name, read out of app.config rather than restated here.
 *
 * The recorded bug was the *mismatch*, not the values: a guard that spells
 * `zinc` itself is a second place the brand is written down, and can drift
 * exactly as far as the markup it polices. Derived, a rebrand is one edit in
 * app.config and the surface guard below re-aims on its own.
 *
 * Read out of the `colors` block with comments already blanked, not out of the
 * file: app.config's header comment quotes the old `neutral: 'slate'` as the
 * bug it describes, and a file-wide match on this very pattern answered
 * `slate` — building the guard from the defect it exists to prevent.
 */
const NEUTRAL = BRAND.match(/neutral:\s*'([a-z]+)'/)?.[1]

describe('brand configuration', () => {
  it('names a family for all three brand roles', () => {
    // Which family each role names is a brand decision, and one file is the
    // right number of places for it. That all three are named is the invariant:
    // `primary` and `neutral` because every semantic token derives from them,
    // `secondary` because the AI-assisted surfaces were hardcoding violet in
    // four separate files before it had a name.
    for (const role of ['primary', 'secondary', 'neutral']) {
      expect(BRAND, role).toMatch(new RegExp(`${role}:\\s*'[a-z]+'`))
    }

    expect(NEUTRAL, 'the neutral family, which the surface guard is built from').toBeDefined()
  })
})

describe('semantic surface tokens', () => {
  // Anything matched here is a colour that will not follow the theme and has to
  // be maintained twice, once per colour mode.
  //
  // No part of this pattern is an allowlist any more, because every allowlist it
  // replaces was empty of the thing it was written to catch.
  //
  // The prefix set was `bg|text|border|divide` while 64 live utilities painted
  // with `placeholder-` (60), `via-` (2), `shadow-` (1) and `ring-offset-` (1) —
  // among them `error.vue`'s hand-maintained
  // `shadow-zinc-900/[0.06] dark:shadow-black/30`, exactly the defect this
  // guard names. The variant set was `dark:|hover:|group-hover:|focus:`, a
  // second allowlist, so `focus-visible:`, `sm:`, `active:` or any `aria-*:` was
  // enough to slip a utility past unmatched. All 64 were live for as long as
  // this test was green.
  //
  // The *family* set was the third and largest allowlist: four greys. 40 raw
  // `red-*` utilities across seven files sat in the repo untouched by it, every
  // one of them a hand-written dark twin — `bg-red-50/50 dark:bg-red-950/20`
  // panels, `border-red-200 dark:border-red-800/50` inputs and hand-rolled
  // `bg-red-500 hover:bg-red-600` buttons, several of them in class strings that
  // already carried `border-error/30` beside them. Fifteen more painted success
  // and warning surfaces in emerald and amber. So the families are no longer
  // enumerated by what somebody has reached for: it is every family Tailwind
  // ships, plus whatever app.config names, and the legitimate exceptions are
  // named one by one below instead of being spelled as a narrower pattern.
  //
  // In code a bare `zinc-400` can only be a palette reference, so that is what
  // is matched; the surrounding utility is captured only in order to report it.
  const TAILWIND = [
    'slate', 'gray', 'zinc', 'stone',
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
    'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
  ]

  /**
   * The families app.config names, read out of it rather than restated — the
   * same derivation `NEUTRAL` uses, for the same reason. A rebrand to a family
   * Tailwind does not ship (a custom ramp, or one added after this list was
   * written) is still policed, because the union is taken rather than the list
   * being trusted to be complete.
   */
  const BRAND_FAMILIES = [...BRAND.matchAll(/^\s*\w+:\s*'([a-z]+)'/gm)].map(m => m[1])

  // `neutral-*` is deliberately absent: that one *is* the indirection,
  // `--color-neutral-*` resolving to whatever app.config declares. Every other
  // grey is in, whichever one is currently named — after a rebrand the previous
  // neutral is exactly as wrong as it was before.
  const FAMILIES = [...new Set([...TAILWIND, ...BRAND_FAMILIES])].filter(f => f !== 'neutral')
  const OFFENDERS = new RegExp(`[\\w:./[\\]-]*\\b(?:${FAMILIES.join('|')})-\\d{2,3}\\b[\\w/.%[\\]-]*`, 'g')

  /**
   * The three files a raw family is allowed in, and why each one.
   *
   * Exempted by name with a reason, never by narrowing the pattern: the four
   * greys were a narrowed pattern, and the cost of that was 64 live utilities
   * under a green test. An exemption that has to be written down is one someone
   * can argue with; a regex that quietly does not reach is not.
   *
   * The exemption is also narrowed to the *construct* the styling rule allows,
   * not to the file: only a gradient colour stop is forgiven, so the tinted
   * error panel that used to sit in `error.vue` would still fail here.
   */
  const GRADIENT_BRAND_MOMENTS: Record<string, string> = {
    'app/layouts/auth.vue':
      'the auth brand moment: four full-bleed washes and the icon tile, on a screen with no work on it to compete with',
    'app/error.vue':
      'mirrors the auth washes, and for the same reason — nothing on the page to compete with',
    'app/layouts/default.vue':
      'the logo tile, the only gradient in the app chrome'
  }

  /** `from-`/`via-`/`to-`, under any variant chain. A stop, not a surface. */
  const IS_STOP = /(?:^|:)(?:from|via|to)-/

  /** Every raw-family utility in `app/**.vue`, with the file it sits in. */
  function rawPaletteUtilities(): { where: string, file: string, utility: string }[] {
    const found: { where: string, file: string, utility: string }[] = []
    for (const path of vueFiles()) {
      const file = path.replace(ROOT + '/', '')
      // Every match on a line, not the first: one class attribute routinely
      // carries a light utility and its dark twin, and reporting one of them
      // turns a single fix into two rounds of the same failure.
      markup(path).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(OFFENDERS)) {
          found.push({ where: `${file}:${i + 1}  ${m[0]}`, file, utility: m[0] })
        }
      })
    }
    return found
  }

  it('names a family for every semantic role the templates paint with', () => {
    // A role the markup uses but app.config does not name takes Nuxt UI's
    // default family, which is a brand decision made in node_modules. That is
    // how `text-success` came to resolve to green-500 while the markup beside it
    // was hand-written emerald, and how `text-warning` came to resolve to
    // yellow-500 beside hand-written amber — the recorded indigo-vs-blue seam,
    // one family out, in single class strings rather than across files.
    //
    // Which roles are in play is read out of the templates, the way
    // `auth-routes.test.ts` reads the pages directory, so a role that starts
    // being used tomorrow is covered without editing this list.
    const ROLES = ['primary', 'secondary', 'success', 'info', 'warning', 'error']
    const templates = vueFiles().map(markup).join('\n')
    const inUse = ROLES.filter(role => new RegExp(`[\\w:/[\\]-]*-${role}\\b`).test(templates))

    expect(inUse.length, 'roles found in the templates').toBeGreaterThan(0)
    for (const role of inUse) {
      expect(BRAND, `${role}, which the templates paint with`).toMatch(new RegExp(`${role}:\\s*'[a-z]+'`))
    }
  })

  it('no template paints a surface with a raw palette utility', () => {
    const offenders = rawPaletteUtilities()
      .filter(({ file, utility }) => !(file in GRADIENT_BRAND_MOMENTS && IS_STOP.test(utility)))
      .map(({ where }) => where)

    expect(offenders).toEqual([])
  })

  it('every gradient exemption is still load-bearing', () => {
    // An exemption nobody needs is an exemption nobody notices going stale, and
    // this one is broad enough to matter: it forgives a whole family in a file.
    // Each entry has to still be earning it.
    const forgiven = rawPaletteUtilities().filter(({ file, utility }) =>
      file in GRADIENT_BRAND_MOMENTS && IS_STOP.test(utility))

    for (const [file, reason] of Object.entries(GRADIENT_BRAND_MOMENTS)) {
      expect(forgiven.some(f => f.file === file), `${file} — ${reason}`).toBe(true)
    }
  })
})

/**
 * Two utilities setting one CSS property under one variant.
 *
 * CLAUDE.md states the trap ("two `bg-*` utilities on one element is a coin
 * flip decided by stylesheet order") and nothing enforced it, so the token
 * migration reintroduced it 45 times in 16 files: `bg-zinc-50 dark:bg-zinc-950`
 * was rewritten to `bg-muted bg-default`, dropping the `dark:` and keeping both
 * classes. Tailwind emits these in `@theme` declaration order, so the *later*
 * key wins regardless of authoring order — `bg-muted bg-accented` painted
 * accented — which meant roughly half the sites rendered what had been the dark
 * value in both modes, one step too dark in light mode.
 *
 * The property is derived from each utility rather than matched against a list
 * of known-bad pairs, so a token added to the theme is covered the day it lands.
 * Utilities are grouped by variant *and* property because `bg-muted
 * hover:bg-elevated` is two properties in two states, not a conflict.
 *
 * The one deterministic case is exempt on its mechanism, not by name: if exactly
 * one member of a group carries `!`, the winner is declared rather than
 * inherited from stylesheet order, which is the property this guards.
 */
describe('one utility per property', () => {
  /** The CSS property a utility paints, or null if it paints none. */
  function paintedProperty(utility: string): string | null {
    const u = utility.replace(/!$/, '')
    if (/^bg-(gradient|linear|radial|conic|clip|origin|repeat|blend|\[)/.test(u)) return null
    if (/^bg-(none|cover|contain|auto|center|top|bottom|left|right|fixed|local|scroll)$/.test(u)) return null
    if (/^bg-/.test(u)) return 'background-color'
    // `text-` is overloaded: size, alignment and wrapping share the prefix.
    if (/^text-(\d|xs|sm|base|lg|xl|\dxl|2xs|\[|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)/.test(u)) return null
    if (/^text-/.test(u)) return 'color'
    if (/^border(-[xylrtbse])?$/.test(u)) return null
    if (/^border-([xylrtbse]-)?\d+(\.\d+)?$/.test(u) || /^border-([xylrtbse]-)?\[/.test(u)) return null
    if (/^border-(solid|dashed|dotted|double|none|hidden|collapse|separate|spacing)/.test(u)) return null
    if (/^border-/.test(u)) return 'border-color'
    if (/^ring-\d+(\.\d+)?$/.test(u) || /^ring-\[/.test(u) || /^ring-inset$/.test(u)) return null
    if (/^ring-offset-/.test(u)) return null
    if (/^ring-/.test(u)) return 'ring-color'
    return null
  }

  function conflicts(source: string) {
    const found: string[] = []
    for (const [i, line] of source.split('\n').entries()) {
      for (const quoted of line.match(/'[^']*'|"[^"]*"/g) || []) {
        const groups = new Map<string, string[]>()
        for (const token of quoted.slice(1, -1).split(/\s+/).filter(Boolean)) {
          const [, variants = '', base = ''] = token.match(/^((?:[a-z0-9-]+:)*)(.+)$/) || []
          const property = paintedProperty(base)
          if (!property) continue
          const key = variants + property
          groups.set(key, [...(groups.get(key) || []), token])
        }
        for (const [key, tokens] of groups) {
          if (tokens.length < 2) continue
          // Exactly one `!` makes the winner explicit, so order stops deciding.
          if (tokens.filter(t => t.endsWith('!')).length === 1) continue
          found.push(`L${i + 1} ${key.replace(/[a-z-]+$/, '')}→ ${tokens.join(' + ')}`)
        }
      }
    }
    return found
  }

  it('no element sets one property twice under the same variant', () => {
    const offenders: string[] = []
    for (const file of vueFiles()) {
      for (const hit of conflicts(markup(file))) {
        offenders.push(`${file.replace(ROOT + '/', '')}:${hit}`)
      }
    }
    expect(offenders, 'stylesheet order decides which of these wins, not you').toEqual([])
  })

  it('recognises a conflict when it sees one', () => {
    // The guard above is only meaningful while it can still fail, and it reports
    // an empty array either way. A synthetic element proves the mechanism rather
    // than requiring a live defect to stay in the repo to prove it.
    expect(conflicts(`<div class="rounded bg-muted bg-default" />`)).toHaveLength(1)
    expect(conflicts(`<div class="text-sm hover:text-toned hover:text-default" />`)).toHaveLength(1)
    // …and does not fire on the shapes that are legitimately two utilities.
    expect(conflicts(`<div class="bg-muted hover:bg-elevated sm:bg-default" />`)).toHaveLength(0)
    expect(conflicts(`<div class="text-xs text-muted" />`)).toHaveLength(0)
    expect(conflicts(`<div class="bg-muted bg-default!" />`)).toHaveLength(0)
    expect(conflicts(`<div class="border border-t-2 border-default" />`)).toHaveLength(0)
  })
})

/**
 * Focus lands on text entry, and only there.
 *
 * The app used to draw one 2px ring on everything focusable, from an *unlayered*
 * `:focus-visible` rule — which meant it did not sit under the components, it
 * overrode them. Every `UInput` drew two concentric boxes (Nuxt UI's own soft
 * halo plus this one); the command palette got a hard box round an input that
 * sets `focus:outline-none` on purpose; the markdown editor got a second box
 * round its textarea, clipped by the shell's `overflow-hidden`; and the rule's
 * `border-radius` mutated the element, so every `rounded-full` control snapped
 * to a 6px square on focus. Twenty `outline-none` opt-outs were written against
 * it and every one was dead code, because unlayered beats `@layer utilities`.
 *
 * What replaced it is one sentence: **the boundary a text field already has
 * turns primary**. A boxed field has a border; a seamless title reserves a
 * transparent one; a composite control (the markdown editor, the quick-add card,
 * the mention popover) states it on the shell that owns the boundary. Nuxt UI's
 * inputs draw their boundary as a `ring-inset` and colour it themselves.
 *
 * These guard both directions, which is what the old one could not do — it only
 * asked whether an opt-out had a replacement, so the twenty dead `outline-none`
 * and the two rings on every `UInput` were all invisible to it.
 */
describe('focus lands on text entry, and only there', () => {
  /** Utilities that paint a focus marker. `opacity` is excluded on purpose: a
   *  control that fades in on focus is the control appearing, not a ring. */
  const PAINTS_ON_FOCUS = /(^|[\s"'`])focus(-visible|-within)?:(border|ring|outline|shadow|bg)[\w./[\]-]*/g
  /** The two exceptions, each a colour the app already reserves for a meaning:
   *  `error` for the type-the-name-to-delete confirmations, `secondary` for the
   *  agent-briefing field on a section already labelled violet. */
  const NAMED_EXCEPTIONS = /^focus:border-(error(\/\d+)?|secondary)$/
  /** Where a field owns no line of its own, the thing that owns one states focus
   *  for it — still a border, because focus is never a fill. Two structures:
   *  a composite control (markdown editor, quick-add card, mention popover) has
   *  a shell; and a field that is a *cell* in a row-table has the row, whose
   *  separator is the line beneath it. The row-tables dropped `divide-y` for
   *  exactly this: a separator drawn as the *next* row's top border cannot be
   *  reached by the focused row, so each row now draws the line beneath itself. */
  const SHELL = /^focus-within:border-primary$/

  /** Focus utilities in `src` that are neither a shell nor a named exception. */
  function strayMarkers(src: string): string[] {
    return src.split('\n').flatMap((line, i) =>
      [...line.matchAll(PAINTS_ON_FOCUS)]
        // The match carries its leading boundary character, which is a quote as
        // often as a space — the utility that opens a `class="` attribute.
        .map(m => m[0].replace(/^[\s"'`]+/, ''))
        .filter(util => !SHELL.test(util) && !NAMED_EXCEPTIONS.test(util))
        .map(util => `${i + 1}  ${util}`))
  }

  /** Text controls in `src` with no edge for `main.css` to colour. */
  function edgelessFields(src: string): number[] {
    const CONTROL_TYPES = /type="(checkbox|radio|file|submit|button|reset|image|hidden)"/
    // The component owns something that states focus for its fields — a
    // composite control's shell, or a row-table row. Scoped to the file rather
    // than to nearby lines: `MarkdownEditor` declares its shell at the top of
    // the template and its textarea ~150 lines below, so any proximity window
    // wide enough to catch that is wide enough to be noise.
    if (/focus-within:border-primary/.test(src)) return []

    const out: number[] = []
    for (const m of src.matchAll(/<(input|textarea)\b/g)) {
      const end = src.indexOf('>', m.index!)
      const tag = src.slice(m.index!, end === -1 ? m.index! + 700 : end)
      if (CONTROL_TYPES.test(tag)) continue

      const tokens = (tag.match(/class="([\s\S]*?)"/)?.[1] ?? '').split(/\s+/)
      // Its own edge: a full border, or a reserved single side. `border-0` is
      // the absence of one, and `border-transparent` is a colour, not a width.
      if (tokens.some(t => /^border(-[btlrxy])?(-\d+)?$/.test(t) && t !== 'border-0')) continue

      out.push(src.slice(0, m.index!).split('\n').length)
    }
    return out
  }

  it('no markup paints a focus marker except the shells and the two named colours', () => {
    const offenders = vueFiles().flatMap(f =>
      strayMarkers(markup(f)).map(hit => `${f.replace(ROOT + '/', '')}:${hit}`))
    expect(offenders, 'focus is stated once, in main.css — not per element').toEqual([])
  })

  it('nothing suppresses focus, because there is nothing left to suppress', () => {
    // `outline-none` and `ring-0!` were written to fight the old blanket ring —
    // and twenty of them were dead code, because unlayered CSS beat them. The
    // reset in `main.css` clears every outline already, so a new one means
    // someone is fighting the system rather than using it.
    const offenders = vueFiles().flatMap((f) => {
      const lines = markup(f).split('\n')
      return lines.flatMap((line, i) =>
        /(^|\s)(outline-none!?|ring-0!)(\s|"|')/.test(line) ? [`${f.replace(ROOT + '/', '')}:${i + 1}`] : [])
    })
    expect(offenders, 'the reset already clears these').toEqual([])
  })

  it('every text field has a boundary that can turn primary', () => {
    // The half of the invariant the markup owns. `main.css` colours a border it
    // cannot create: an input with `border-0` and no reserved edge shows nothing
    // at all on focus, which is exactly how fourteen fields — three of them
    // password fields — ended up with no focus state under the old ring too.
    const offenders = vueFiles().flatMap(f =>
      edgelessFields(markup(f)).map(line => `${f.replace(ROOT + '/', '')}:${line}`))
    expect(offenders, 'these fields have no edge to colour, so focus shows nothing').toEqual([])
  })

  /** Fields that draw a line *and* sit in something drawing one for them. */
  function doubledFields(src: string): number[] {
    const out: number[] = []
    for (const m of src.matchAll(/<(input|textarea)\b/g)) {
      const end = src.indexOf('>', m.index!)
      const tag = src.slice(m.index!, end === -1 ? m.index! + 700 : end)
      if (!/border-b border-transparent/.test(tag)) continue
      // The element that wraps it, which for a row-table row or an inline chip
      // is within a few lines. Deliberately narrow: a shell further away in the
      // file belongs to some other field, which is the shape of every false
      // positive here — three seamless titles whose component also owns a table.
      const above = src.slice(0, m.index!).split('\n').slice(-6).join('\n')
      if (/focus-within:border-primary/.test(above)) {
        out.push(src.slice(0, m.index!).split('\n').length)
      }
    }
    return out
  }

  it('no field draws a line and sits in something drawing one for it', () => {
    // The API token field reserved its own underline *and* sat in a row that
    // states focus, so focusing it drew two lines a row apart. Whichever owns
    // the boundary states it — never both.
    const offenders = vueFiles().flatMap(f =>
      doubledFields(markup(f)).map(line => `${f.replace(ROOT + '/', '')}:${line}`))
    expect(offenders, 'two lines for one focus').toEqual([])
  })

  /** `flex-1` text controls that can still refuse to shrink. */
  function unshrinkableFields(src: string): number[] {
    const out: number[] = []
    for (const m of src.matchAll(/<(input|textarea)\b/g)) {
      const end = src.indexOf('>', m.index!)
      const tag = src.slice(m.index!, end === -1 ? m.index! + 900 : end)
      const toks = (tag.match(/class="([\s\S]*?)"/)?.[1] ?? '').split(/\s+/)
      if (!toks.includes('flex-1')) continue
      if (toks.includes('min-w-0') || toks.includes('w-full')) continue
      out.push(src.slice(0, m.index!).split('\n').length)
    }
    return out
  }

  it('a flex-1 field can actually shrink', () => {
    // Not a focus rule, but this is how the focus border surfaced it. A flex
    // item defaults to `min-width: auto`, and an `<input>`'s intrinsic width is
    // its ~20-character `size`, so `flex-1` alone does not let it shrink. The
    // add-status and add-tag fields sat in a `w-52` popover and overflowed its
    // right edge by 20px — invisible until a focused border was drawn crossing
    // the panel wall.
    const offenders = vueFiles().flatMap(f =>
      unshrinkableFields(markup(f)).map(line => `${f.replace(ROOT + '/', '')}:${line}`))
    expect(offenders, 'flex-1 without min-w-0 overflows a narrow container').toEqual([])
  })

  it('recognises each violation when it sees one', () => {
    expect(unshrinkableFields('<input class="flex-1 px-2">')).toHaveLength(1)
    expect(unshrinkableFields('<input class="flex-1 min-w-0 px-2">')).toHaveLength(0)
    expect(unshrinkableFields('<input class="w-full px-2">')).toHaveLength(0)

    expect(doubledFields('<div class="focus-within:border-primary">\n<input class="border-0 border-b border-transparent">')).toHaveLength(1)
    // A shell far above belongs to a different field, not to this one.
    expect(doubledFields('<div class="focus-within:border-primary" />' + '\n'.repeat(9) + '<input class="border-0 border-b border-transparent">')).toHaveLength(0)

    // All three guards above report an empty array either way, so each needs a
    // synthetic case to prove the mechanism still bites — otherwise a typo in a
    // regex retires the guard silently and the file still reads as protected.
    expect(strayMarkers('<div class="focus-visible:ring-2 ring-primary" />')).toHaveLength(1)
    expect(strayMarkers('<input class="focus:border-primary">')).toHaveLength(1)
    expect(strayMarkers('<div class="focus-within:ring-1" />')).toHaveLength(1)
    // …and passes the shapes that are legitimately there.
    expect(strayMarkers('<div class="focus-within:border-primary" />')).toHaveLength(0)
    // Focus is never a fill — a background was tried for the row-tables and
    // dropped, because it made a second visual language out of one sentence.
    expect(strayMarkers('<div class="focus-within:bg-elevated" />')).toHaveLength(1)
    expect(strayMarkers('<input class="focus:border-error/60">')).toHaveLength(0)
    expect(strayMarkers('<textarea class="focus:border-secondary" />')).toHaveLength(0)
    expect(strayMarkers('<button class="focus-visible:opacity-100" />')).toHaveLength(0)

    expect(edgelessFields('<input class="bg-transparent border-0">')).toHaveLength(1)
    expect(edgelessFields('<textarea class="p-2" />')).toHaveLength(1)
    // A reserved edge, a full border, and a shell each satisfy it.
    expect(edgelessFields('<input class="border-0 border-b border-transparent">')).toHaveLength(0)
    expect(edgelessFields('<input class="border border-default">')).toHaveLength(0)
    expect(edgelessFields('<div class="focus-within:border-primary"><textarea /></div>')).toHaveLength(0)
    // Controls carry their focus in their type, not in a border.
    expect(edgelessFields('<input type="checkbox" class="size-4">')).toHaveLength(0)
  })
})

describe('the focus rules in main.css', () => {
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')

  it('clears the outline on pseudo-elements too', () => {
    // Nuxt UI's `UNavigationMenu` hangs its focus halo on a `::before` rather
    // than on the link, so a reset that only names the element leaves the whole
    // sidebar ringed. Found by auditing the live DOM, not by reading the theme.
    const reset = css.match(/\*:focus-visible[\s\S]{0,120}?\{[^}]*\}/)?.[0] ?? ''
    expect(reset, 'the reset must reach ::before').toMatch(/::before/)
    expect(reset).toMatch(/outline:\s*none/)
  })

  it('keeps the text-entry rule between a resting border and a per-field override', () => {
    // The rule has to beat `.border-default` (0,1,0) and lose to
    // `.focus\:border-error\/60:focus` (0,2,0), which puts it at (0,1,1) — one
    // element plus one pseudo-class, and nothing else that counts.
    //
    // Both halves of that have already been got wrong here. In `@layer base` it
    // lost to the resting `border-default` on every field in the app and did
    // nothing, which is indistinguishable from working if you only test a field
    // that has no border class. And a bare `:not([type="checkbox"], …)` adds
    // (0,1,0) of its own, landing the rule at (0,2,1) — beating the per-field
    // overrides it exists to lose to. `:where()` is what zeroes it.
    const rule = css.match(/@layer utilities \{[\s\S]*?input:not\([\s\S]*?\}\s*\}/)?.[0]
    expect(rule, 'the text-entry rule must be in @layer utilities').toBeDefined()
    expect(rule!, 'the :not() must be wrapped in :where() to stay at (0,1,1)')
      .toMatch(/input:not\(:where\(/)
    expect(rule!).toMatch(/border-color:\s*var\(--ui-primary\)/)

    // And it must not have grown a second declaration: the whole point is that
    // focus is a border colour, so nothing reflows and nothing clips.
    const body = rule!.slice(rule!.lastIndexOf('{') + 1, rule!.indexOf('}', rule!.lastIndexOf('{')))
    expect(body.split(';').filter(d => d.trim()), 'focus is one declaration').toHaveLength(1)
  })
})

/**
 * Every form control says what it is.
 *
 * A `placeholder` is not an accessible name: it is a hint, several screen
 * readers ignore it for naming, and it disappears the moment anything is typed.
 * Twenty-six controls relied on one anyway — including both password fields on
 * the account-deletion form and the type-the-name confirmations, which are
 * exactly the places where "which box is this?" matters most.
 *
 * Two ways to satisfy it, and the choice is not arbitrary. A control with
 * visible label text should be *associated* with it (`<label for>` + `id`), so
 * the label is also a click target. `aria-label` is for controls that are
 * deliberately seamless — the profile name field reads as the heading it edits,
 * so it has no visible text to point at.
 */
describe('form controls have accessible names', () => {
  /** `id` counts because a `<label for>` in the same file is how these pair up. */
  const NAMED = /(^|\s)(aria-label(?:ledby)?|:aria-label(?:ledby)?|id)=/
  /** Controls that carry their name in their type rather than in text. */
  const SELF_DESCRIBING = /type="(hidden|checkbox|radio|submit|button|file|image|reset)"/

  it('no input, select or textarea relies on a placeholder alone', () => {
    const offenders: string[] = []
    for (const file of vueFiles()) {
      const src = markup(file)
      for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
        const end = src.indexOf('>', m.index)
        const attrs = src.slice(m.index, end === -1 ? m.index + 400 : end)
        if (NAMED.test(attrs) || SELF_DESCRIBING.test(attrs)) continue
        offenders.push(`${file.replace(ROOT + '/', '')}:${src.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(offenders, 'a placeholder is a hint, not a name').toEqual([])
  })

  it('every `for` points at an id that exists in the same file', () => {
    // The half that rots silently: rename the input's id and the label goes on
    // looking associated while pointing at nothing.
    const broken: string[] = []
    for (const file of vueFiles()) {
      const src = markup(file)
      const ids = new Set([...src.matchAll(/\bid="([^"{}]+)"/g)].map(m => m[1]))
      // Literal `for="…"` only: `(?<![\w:-])` skips the `for` inside `v-for`
      // and the bound `:for="expr"`, whose target id lives in the consumer.
      for (const m of src.matchAll(/(?<![\w:-])for="([^"{}]+)"/g)) {
        if (!ids.has(m[1]!)) broken.push(`${file.replace(ROOT + '/', '')} → for="${m[1]}"`)
      }
    }
    expect(broken, 'a label pointing at no control names nothing').toEqual([])
  })
})

describe('priority', () => {
  it('covers every priority in every lookup', () => {
    for (const p of PRIORITIES) {
      expect(priorityTextClass(p.value), p.value).toMatch(/^text-/)
      expect(priorityChartClass(p.value), p.value).toMatch(/^bg-/)
      expect(priorityUiColor(p.value), p.value).toBeTruthy()
      expect(priorityIcon(p.value), p.value).toMatch(/^i-lucide-/)
      expect(priorityLabel(p.value), p.value).toBe(p.label)
    }
  })

  it('spends colour only on high and urgent', () => {
    // Most cards on a board are medium. Colouring medium — it used to be indigo,
    // the brand colour — meant the accent carried no information at all.
    //
    // The rule is that low and medium are *neutral*; which grey step each takes
    // is tuning, and pinning the exact class made a retune a test edit. High and
    // urgent stay pinned to their roles, because warning/error is the decision.
    const NEUTRAL_TEXT = /^text-(dimmed|muted|toned|default)$/
    expect(priorityTextClass('low')).toMatch(NEUTRAL_TEXT)
    expect(priorityTextClass('medium')).toMatch(NEUTRAL_TEXT)
    expect(priorityTextClass('high')).toBe('text-warning')
    expect(priorityTextClass('urgent')).toBe('text-error')
  })

  it('draws an edge bar only for the priorities that need attention', () => {
    expect(priorityBarClass('low')).toBe('')
    expect(priorityBarClass('medium')).toBe('')
    expect(priorityBarClass('high')).toBe('bg-warning')
    expect(priorityBarClass('urgent')).toBe('bg-error')
  })

  it('keeps all four levels distinguishable in charts', () => {
    // The chart is the one place the colour *is* the data, so unlike the chrome
    // it cannot collapse low and medium onto the same fill.
    const fills = PRIORITIES.map(p => priorityChartClass(p.value))
    expect(new Set(fills).size).toBe(PRIORITIES.length)
  })

  it('does not use grip-horizontal, which reads as a drag handle on a card', () => {
    expect(PRIORITIES.map(p => p.icon)).not.toContain('i-lucide-grip-horizontal')
  })

  it('falls back safely for an unknown priority', () => {
    // Neutral and bar-less, like low/medium — the exact grey is tuning here too.
    expect(priorityTextClass('bogus')).toMatch(/^text-(dimmed|muted|toned|default)$/)
    expect(priorityBarClass('bogus')).toBe('')
    expect(priorityIcon('bogus')).toBe('i-lucide-equal')
  })
})

describe('type scale', () => {
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')

  /**
   * Every declared step keyed by the pixel size behind it, read out of the
   * declarations rather than restated, so retuning a step re-derives instead of
   * needing a test edit. `--text-*--line-height` is unitless and drops out.
   */
  const STEPS = new Map(
    [...css.matchAll(/--text-(\w+):\s*([\d.]+)rem/g)].map(m => [Number(m[2]) * 16, m[1]!] as const)
  )

  it('leaves no arbitrary font sizes, in a class or in a style block', () => {
    // 726 inline `text-[Npx]` values spanned nineteen sizes, nine of them
    // half-pixel nudges for one specific element. Six named steps replace them.
    //
    // The `<style>` half is the same defect one layer down, and the reason this
    // title used to be false: the guard scanned the Tailwind form only, while
    // ProseDescription declared `font-size: 14px`, `13px` and `10px` in CSS —
    // each of them a step spelled as the number behind it, in a file the guard
    // was already reading and reporting clean.
    //
    // Only a bare `px` counts. `0.857em` on inline code is a *ratio*, not a
    // literal off this scale: code inside a heading has to scale with its host.
    // So `em`, `rem` and `%` are deliberately not matched.
    expect(STEPS.size, 'declared --text-* steps').toBeGreaterThan(0)

    // A raw px is allowed only at a size no step carries, and then only by name
    // with a reason. Keyed by file and value, not by line, so the list does not
    // rot the next time something is inserted above it.
    const OFF_STEP: Record<string, string> = {}

    const offenders: string[] = []
    const claimed = new Set<string>()
    for (const file of vueFiles()) {
      const name = file.replace(ROOT + '/', '')
      markup(file).split('\n').forEach((line, i) => {
        const utility = line.match(/text-\[\d+(\.\d+)?px\]/)
        if (utility) offenders.push(`${name}:${i + 1}  ${utility[0]}`)

        const declared = line.match(/font-size:\s*(\d+(\.\d+)?)px/)
        if (!declared) return

        const site = `${name}  font-size: ${declared[1]}px`
        const step = STEPS.get(Number(declared[1]))
        if (step) offenders.push(`${site}:${i + 1}  is var(--text-${step})`)
        else if (site in OFF_STEP) claimed.add(site)
        else offenders.push(`${site}:${i + 1}  is on no step and unexplained`)
      })
    }

    expect(offenders).toEqual([])
    // And the exemptions are not a dead list: one nothing matches is a rule that
    // has quietly lapsed, or a token that arrived after the exemption did.
    expect([...claimed].sort()).toEqual(Object.keys(OFF_STEP).sort())
  })

  it('allows a display step only where nothing competes with it', () => {
    // The ladder has a display tier now, so the question is no longer whether
    // anything may sit above `xl` but where. A display step is allowed on a
    // surface with no work to compete with — a full stop, not a place where
    // someone is doing something. The mechanism is the rule; the list below is
    // only the set of surfaces that currently satisfy it, with the reason each
    // one does, so that adding to it means arguing the mechanism.
    const ALLOWED: Record<string, string> = {
      'app/error.vue': 'a dead end — one headline, one line of copy, one way out',
      'app/layouts/auth.vue': 'the wordmark, over a page whose only job is one form',
      'app/components/profile/ProfileActivity.vue': 'a single stat readout, and it is a number'
    }

    // The other half of the rule, and the half an exemption list cannot state:
    // the dense working surfaces, where a display step is wrong by construction.
    // Asserted to be scanned at all, because a guard that names files silently
    // stops guarding them the day one is renamed.
    const WORKING = [
      'app/components/KanbanCard.vue',
      'app/components/ListView.vue',
      'app/components/CardModal.vue',
      'app/pages/projects/[slug]/cards/[cardId].vue',
      'app/pages/projects/[slug]/boards/[boardSlug]/index.vue',
      'app/pages/projects/[slug]/lists/[listSlug]/index.vue'
    ]

    const files = vueFiles().map(f => [f.replace(ROOT + '/', ''), markup(f)] as const)
    const scanned = new Set(files.map(([name]) => name))
    for (const name of WORKING) expect(scanned.has(name), `${name} is scanned`).toBe(true)

    // Only the three declared steps count as the tier. `text-5xl` and up are
    // undeclared again, and undeclared is exactly how the two sites that reached
    // past 20px ended up with Tailwind's 1.5 leading in the first place.
    const declared = new Set([...css.matchAll(/--text-(\d+xl):/g)].map(m => m[1]!))
    expect(declared, 'the declared display tier').toEqual(new Set(['2xl', '3xl', '4xl']))

    const onWorkingSurface: string[] = []
    const aboveTheTier: string[] = []
    const used = new Set<string>()
    for (const [name, source] of files) {
      for (const m of source.matchAll(/\btext-(\d+xl)\b/g)) {
        used.add(name)
        if (!declared.has(m[1]!)) aboveTheTier.push(`${name}  text-${m[1]}`)
        if (!(name in ALLOWED)) onWorkingSurface.push(`${name}  text-${m[1]}`)
      }
    }

    expect([...new Set(onWorkingSurface)].sort(), 'display type where there is work').toEqual([])
    expect([...new Set(aboveTheTier)].sort(), 'a step above the declared tier').toEqual([])

    // And the allowed set is not a dead list: every surface on it still uses the
    // tier. A named exemption nothing matches is a rule that has quietly lapsed.
    expect([...used].sort()).toEqual(Object.keys(ALLOWED).sort())
  })

  it('spells the display face and its tracking as tokens with call sites', () => {
    // `--font-display` is a role, not a face, so call sites survive the face
    // changing; `--tracking-display` exists because the app already retypes its
    // optical tracking as a literal in eleven files. Both are asserted to be
    // reached, since this repo has shipped a declared thing with zero call sites
    // twice, and a token nobody spells is a token nobody maintains.
    expect(css, '--font-display').toMatch(/--font-display:/)
    expect(css, '--tracking-display').toMatch(/--tracking-display:/)

    const face: string[] = []
    const tracking: string[] = []
    for (const file of vueFiles()) {
      const source = markup(file)
      if (/\bfont-display\b/.test(source)) face.push(file.replace(ROOT + '/', ''))
      if (/\btracking-display\b/.test(source)) tracking.push(file.replace(ROOT + '/', ''))
    }

    expect(face, 'font-display call sites').not.toEqual([])
    expect(tracking, 'tracking-display call sites').not.toEqual([])
  })

  it('keeps arbitrary values out of the families that have a closed scale', () => {
    // Arbitrary values are not banned outright here, because they are not banned
    // in the app: 152 are live, and a test that claimed otherwise would be false
    // rather than strict. 61 of them are `tracking-[…]`, the app's optical
    // tracking idiom, and most of the rest is one-off geometry on the auth and
    // error illustrations. This design system declares no letter-spacing scale
    // and no illustration-width scale for either to deviate from, and inventing
    // one so that a rule comes out true is the wrong way round.
    //
    // What is banned is an arbitrary value in a family main.css *does* close,
    // where a literal is either a token that already exists or one that wants
    // naming. That is the whole claim, and it is the claim asserted.
    // The families main.css closes with a named scale, and the block that
    // closes each:
    const CLOSED = [
      'text', //    --text-*, six working steps and three display steps
      'leading', // --text-*--line-height, one per step
      'rounded', // --radius-*, three steps
      'shadow' //   --shadow-raise/float/drag, each defined per colour mode
    ]

    // One entry per site that stays, with the reason it is not a migration.
    const OFF_SCALE = [
      // An inset hairline ring in the priority hue, not an elevation. `--shadow-*`
      // is the elevation ramp and has nothing inset in it; the nearest thing on
      // a scale, `ring-2 ring-inset ring-current`, is a visibly heavier edge on
      // a pill this small.
      'app/components/ViewConfigModal.vue  shadow-[inset_0_0_0_1.5px_currentColor]',
      // The markdown source pane wants a looser measure than any step carries.
      // `leading-relaxed` (1.625) is the nearest and re-flows every line in the
      // editor, which makes it a design change rather than a migration.
      'app/components/MarkdownEditor.vue  leading-[1.7]'
    ]

    const pattern = new RegExp(`(?:[\\w-]+:)*\\b(?:${CLOSED.join('|')})-\\[[^\\]]+\\]`, 'g')

    const found = new Set<string>()
    for (const file of vueFiles()) {
      for (const m of markup(file).matchAll(pattern)) {
        found.add(`${file.replace(ROOT + '/', '')}  ${m[0]}`)
      }
    }

    expect([...found].sort()).toEqual([...OFF_SCALE].sort())
  })

  it('spells elevation as the ramp, not as a Tailwind step', () => {
    // `--shadow-raise/float/drag` exist because every shadow in this app was a
    // plain `oklch(0 0 0 / …)` with no dark value, and a black shadow on a dark
    // surface is invisible: kanban cards lifted on hover with no depth cue at all.
    // Declaring the ramp did not close the hole. 22 raw Tailwind steps stayed live
    // at 20 sites against the ramp's 6, and `layouts/auth.vue` hand-maintained
    // `shadow-indigo-500/25 dark:shadow-indigo-500/10` — the exact defect, with
    // its own fix declared two files away.
    //
    // So the claim is the whole family, not just its arbitrary form: every
    // `shadow-` utility names a step main.css declares. That bans Tailwind's
    // sm/md/lg/xl/2xl and any step it adds later, and it bans a hand-picked hue
    // too — a tint is a second per-mode value maintained by hand, which is the
    // thing the ramp took over. The ramp already carries the one brand-tinted
    // shadow that means something: `--elevation-drag`'s second layer is an indigo
    // ring, spent on the card that is actually lifted.
    const RAMP = [...css.matchAll(/--shadow-([a-z]+):/g)].map(m => m[1]!)

    // Pinned, for the same reason the display tier is: a derivation that silently
    // came back empty would turn this guard into a rule that passes everything.
    expect([...RAMP].sort(), 'the declared elevation ramp').toEqual(['drag', 'float', 'raise'])

    // One entry per site that stays, with the reason it is not a migration.
    // Empty: all 20 migrated, and the two that carried a red glow on a solid red
    // delete button lost the markup entirely when the button became a `UButton`.
    const OFF_RAMP: string[] = []

    // `shadow-[…]` is the arbitrary form, which the test above owns; matching it
    // here would report one site twice under two different claims.
    const pattern = /(?:[\w-]+:)*\bshadow-(?!\[)([\w./-]+)/g

    // app.config is scanned with the templates because a Nuxt UI slot is markup
    // by another name — the popover and dropdown elevation is declared there, and
    // a `shadow-md` in a slot string is the same reach around the ramp.
    const sources: [string, string][] = vueFiles().map(f => [f.replace(ROOT + '/', ''), markup(f)])
    sources.push(['app/app.config.ts', APP_CONFIG])

    const offenders: string[] = []
    const spelled: string[] = []
    for (const [name, source] of sources) {
      for (const m of source.matchAll(pattern)) {
        if (RAMP.includes(m[1]!)) spelled.push(name)
        else offenders.push(`${name}  ${m[0]}`)
      }
    }

    expect([...new Set(offenders)].sort()).toEqual([...OFF_RAMP].sort())

    // And the ramp is reached from markup at all. This repo has shipped a declared
    // token with zero call sites twice, and the second time was this scale.
    expect([...new Set(spelled)].sort(), 'elevation call sites').not.toEqual([])
  })

  it('spells the board column width as a token, not the literal behind it', () => {
    // `w-[280px]` was duplicated between KanbanColumn and KanbanBoard's
    // add-column placeholder, which is what `--spacing-column` was named for.
    // Then `w-[304px]` appeared twice more on the card page, after the token
    // existed — a token only stops duplication if reaching around it fails.
    // Derived from the declaration, so retuning the column stays guarded.
    const rem = css.match(/--spacing-column:\s*([\d.]+)rem/)?.[1]
    expect(rem, '--spacing-column').toBeDefined()

    const literal = new RegExp(`[\\w:-]*-\\[(?:${Number(rem) * 16}px|${rem}rem)\\]`, 'g')
    const offenders: string[] = []
    for (const file of vueFiles()) {
      markup(file).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(literal)) {
          offenders.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${m[0]}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('defines a ladder that is ordered, distinct, and readable at the bottom', () => {
    // Was four pinned rem values, which blocked any retune and caught no bug
    // the steps could actually have. What matters is that the ladder is one:
    // ascending, with no two names for one size — two names for one size is how
    // 726 inline values across nineteen sizes grew in the first place — and a
    // body step nobody has to lean in for.
    const steps = [...css.matchAll(/--text-(\w+):\s*([\d.]+)rem/g)].map(m => ({ name: m[1]!, rem: Number(m[2]) }))
    expect(steps.length, 'redefined type steps').toBeGreaterThan(0)

    const rems = steps.map(s => s.rem)
    expect(rems, 'declared in ascending order').toEqual([...rems].sort((a, b) => a - b))
    expect(new Set(rems).size, 'two names for one size').toBe(rems.length)

    const base = steps.find(s => s.name === 'base')
    expect(base, '--text-base, the body step').toBeDefined()
    expect(base!.rem * 16, '--text-base in px').toBeGreaterThanOrEqual(14)

    // The display tier rides the same ladder — the ascent and distinctness above
    // already cover it — but it has to be *tuned*, and that is the part a size
    // alone does not carry. Every step in it declares its own leading, well
    // under Tailwind's inherited 1.5: 1.5 leading on a 38px headline is what
    // makes large type read as scaled-up body copy, which is the whole reason
    // the two sites that reached past 20px looked accidental.
    for (const name of ['2xl', '3xl', '4xl']) {
      const step = steps.find(s => s.name === name)
      expect(step, `--text-${name}, a declared display step`).toBeDefined()
      expect(step!.rem * 16, `--text-${name} against the 14px body`).toBeGreaterThanOrEqual(14 * 1.75)

      const leading = Number(css.match(new RegExp(`--text-${name}--line-height:\\s*([\\d.]+)`))?.[1])
      expect(leading, `--text-${name} leading`).toBeGreaterThanOrEqual(1.05)
      expect(leading, `--text-${name} leading`).toBeLessThanOrEqual(1.2)
    }

    // xs keeps Tailwind's 12px so Nuxt UI internals relying on it are untouched.
    expect(css).not.toMatch(/--text-xs:/)
  })
})

describe('main.css token layer', () => {
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')

  it('defines every elevation exactly once per colour mode', () => {
    // Every shadow used to be a light-mode black alpha with no dark variant, so
    // cards lifted on hover with no depth cue at all on a dark surface. Counting
    // occurrences file-wide was satisfied by two light-mode definitions, which
    // is the same omission written twice.
    const modes = { ':root': ruleBlock(css, ':root'), '.dark': ruleBlock(css, '.dark') }

    for (const name of ['--elevation-raise', '--elevation-float', '--elevation-drag']) {
      for (const [mode, block] of Object.entries(modes)) {
        const defs = block.match(new RegExp(`${name}:`, 'g')) || []
        expect(defs.length, `${name} in ${mode}`).toBe(1)
      }
    }
  })

  // The focus ring this used to check is gone — focus is a border colour on text
  // entry now, and `focus lands on text entry, and only there` above asserts the
  // same brand-derived property (`var(--ui-primary)`, never a fixed hue) against
  // the rule that actually exists.

  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps every offered colour readable, in both modes, for text and for marks', () => {
    // The assertion the swatch family never had, and the reason it shipped below AA
    // for its whole life. Recomputed from the lightness values in `main.css` across
    // every hex `COLOR_PALETTE` actually offers, which is the set that matters:
    // `#334155` and `#78716c` are in there on purpose, so "a user could pick
    // something dark" is a certainty rather than a risk.
    //
    // Two thresholds, because the family has two kinds of member. `.swatch`,
    // `.swatch-outline` and `.swatch-text` carry text and owe 4.5:1 — their label is
    // 10px bold, so the large-text exemption is not available. `.swatch-dot` and
    // `.swatch-bar` are pure colour and owe 3:1 as graphical objects, which the old
    // recipe missed hardest: it drew them from the stored hex untouched, putting a
    // slate dot at 1.71:1 on a dark page.
    //
    // The old numbers, for the record: light 2.50:1 text / 1.92:1 dot,
    // dark 3.61:1 text / 1.71:1 dot. Four of six under threshold.
    const modes = [
      { name: 'light', selector: '.swatch', page: WHITE },
      { name: 'dark', selector: ':is(.dark) .swatch', page: uiBg(css, '.dark') }
    ] as const

    for (const { name, selector, page } of modes) {
      const recipe = recipeFor(css, selector)
      expect(recipe.mark, `--swatch-mark in \`${selector}\``).toBeDefined()

      for (const hex of COLOR_PALETTE) {
        const fg = applyChannel(hex, recipe.fg)

        // On its own fill (the filled pill) and on the page (outline, and a status
        // name beside its dot) — two different backgrounds, both carrying the label.
        expect(ratio(fg, applyChannel(hex, recipe.fill)), `${hex} label on its fill, ${name}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(fg, page), `${hex} label on the page, ${name}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(applyChannel(hex, recipe.mark!), page), `${hex} dot on the page, ${name}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('sets the swatch lightness rather than mixing it', () => {
    // The mechanism, asserted separately from its outcome: a `color-mix` share
    // produces an output lightness that depends on the *input's*, so no pair of
    // percentages can make a dark stored hex readable — which is why the numbers
    // above were unreachable for as long as the recipe was a mix. Chroma is scaled
    // and not set, so `--swatch: var(--ui-text-dimmed)` stays grey instead of having
    // a hue invented for it.
    for (const selector of ['.swatch', ':is(.dark) .swatch', '.swatch-avatar', ':is(.dark) .swatch-avatar']) {
      expect(ruleBlock(css, selector), selector).not.toMatch(/--swatch-(?:fg|fill|ring|mark): color-mix/)
    }

    expect(recipeFor(css, '.swatch').fill.chroma, 'the fill scales chroma').toBeLessThan(1)
  })
})

/**
 * A person's avatar is the app's only *derived* user colour — every other one
 * (tag, status, project accent) is stored because somebody picked it.
 *
 * It exists because a name is not a face. `UAvatar` renders initials on
 * `bg-elevated`, so TK-21's nine comments showed nine interchangeable grey
 * discs — one fill, nine people — and the one element carrying whose comment
 * this is carried nothing. A hue derived from the name is recognisable before it
 * is read, which is what an avatar is for, and why the tint keys off identity
 * rather than position and follows the person wherever they appear.
 */
describe('identity avatars', () => {
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')

  it('answers the same way every time', () => {
    expect(identityColor('Demo Admin')).toBe(identityColor('Demo Admin'))
    // No person, no colour to claim: the caller is expected to pass `tint: false`
    // for an empty identity slot, but this must not throw on the way there.
    expect(identityColor(null)).toBe(identityColor(undefined))
  })

  it('keeps one-character neighbours apart', () => {
    // The case with no other signal in it. `Lola3`/`Lola4`/`Lola5`/`Lola6` are
    // real dev-seed users whose initials are all "L", so the hue is the only thing
    // separating them — and a hash without avalanche (`length`, a character sum,
    // the first codepoint) would put consecutive names in adjacent buckets and
    // hand three commenters one colour.
    const lolas = ['Lola3', 'Lola4', 'Lola5', 'Lola6'].map(identityColor)

    expect(new Set(lolas).size).toBe(lolas.length)
  })

  it('reaches every colour in the ramp', () => {
    // The ramp size is the only lever on collisions, so a hash that leaves buckets
    // unreachable silently shrinks it. Colour is an aid rather than an identifier
    // — five people in one thread collide about half the time however wide it is,
    // which is why the disc still carries initials — but it must at least be as
    // wide as it looks.
    const spread = Array.from({ length: 500 }, (_, i) => identityColor(`user-${i}`))

    expect(new Set(spread).size).toBe(IDENTITY_COLORS.length)
  })

  it('keeps every identity hue clear of the error colour', () => {
    // An avatar never signals state, and a red disc beside a name suggests it does.
    //
    // This is the third version of this assertion and the first that can fail. It
    // was `expect(spread).not.toContain('#ef4444')` — a hex that had never been in
    // the ramp — while `#f43f5e` sat in it at hue 16.0°, **6.2° from `--ui-error`**.
    // The ramp was then corrected and `constants.ts` was updated to claim the guard
    // computed hue angles. It did not. So a confident claim shipped twice with
    // nothing behind it, in the repo that documents the rule against exactly that —
    // which is the argument for stating a band and computing it rather than naming a
    // value and hoping.
    //
    // The error hue is derived, not restated: `error` is not declared in
    // `app.config.ts`, so Nuxt UI's default family is `red`, and its 400 and 500
    // steps are read out of Tailwind's own theme. Both, because Nuxt UI maps
    // `--ui-error` to a different step per colour mode (400 in dark measures
    // 22.2°, 500 in light 25.3°) and the band should hold in either.
    //
    // 15° excludes rose (6.2° away) and keeps orange (25.8°) and amber (47.8°),
    // which are the palette's warm end and legibly not an error. `--ui-warning` is
    // deliberately not banded: a filled disc of initials does not resemble a status
    // dot, so only the collision that is actually close is worth spending hues on.
    const theme = readFileSync(join(ROOT, 'node_modules/tailwindcss/theme.css'), 'utf8')
    const family = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8').match(/error:\s*'([a-z]+)'/)?.[1] ?? 'red'
    const errorHues = [400, 500].map((step) => {
      const m = theme.match(new RegExp(`--color-${family}-${step}: oklch\\([\\d.]+% [\\d.]+ ([\\d.]+)\\)`))
      expect(m, `--color-${family}-${step} in tailwindcss/theme.css`).not.toBeNull()

      return Number(m![1])
    })

    for (const hex of IDENTITY_COLORS) {
      for (const errorHue of errorHues) {
        // Circular distance. Subtracting from 180 as well — as the first cut of this
        // did — yields the *complement*, which reported cyan at 215° as 13° from red
        // and passed rose at 6.2°. Caught only because the falsification run named a
        // colour that obviously is not near red.
        const gap = Math.abs(((hueOf(hex) - errorHue + 540) % 360) - 180)

        expect(gap, `${hex} at ${hueOf(hex).toFixed(1)}° against ${family} at ${errorHue}°`).toBeGreaterThan(15)
      }
    }
  })

  it('tints only where there is a person, so an absent one looks absent', () => {
    const avatar = readFileSync(join(ROOT, 'app/components/ui/Avatar.vue'), 'utf8')

    // A photo needs no tint (it would paint a fill nothing can see), and `tint`
    // is how a comment whose author has been deleted keeps the neutral disc.
    expect(avatar).toMatch(/props\.tint && !props\.src/)
  })

  it('keeps the initials readable on their own disc, in both modes', () => {
    // The one assertion here that is about people rather than about source text,
    // and the only one that would have caught what shipped first: stepping the
    // foreground in proportion with the fill (82%/20%) looked reasonable and put
    // amber initials at 3.13:1 on their own disc — under AA for 12px text, and
    // "fine" only next to the tag pill's own 2.50:1, which was never a standard to
    // meet. Both members of the family are held to 4.5:1 by the same threshold now,
    // from the lightness values actually in main.css, so retuning the disc has to
    // stay legible rather than merely stay pretty.
    //
    // The disc keeps its *own* two L values rather than the pill's: it is mostly rim
    // and glyph where the pill is mostly fill, so it needs a stronger tint to read as
    // coloured. Under the old recipe that difference had to be spelled as a second
    // set of mix percentages, which is how `.swatch-avatar` briefly became the name
    // of two rules and how this very assertion came to measure the pill's numbers.
    for (const selector of ['.swatch-avatar', ':is(.dark) .swatch-avatar']) {
      const recipe = recipeFor(css, selector)

      for (const hex of IDENTITY_COLORS) {
        const contrast = ratio(applyChannel(hex, recipe.fg), applyChannel(hex, recipe.fill))

        expect(contrast, `${hex} initials under \`${selector}\``).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('colours the initials, which live in a child of the disc', () => {
    // `.swatch` sets `color` on itself, and UAvatar's fallback carries its own
    // `text-muted`. A directly-declared colour beats an inherited one whatever
    // the layers, so reusing `.swatch` tinted the disc and left the letters grey.
    expect(css).toMatch(/\.swatch-avatar > \*\s*\{\s*color: var\(--swatch-fg\)/)
  })

  it('routes every person avatar through UiAvatar', () => {
    // There is no call site in the app that puts something other than a human in
    // the disc, so a bare `UAvatar` is a grey disc sitting next to a tinted one —
    // which on the card page happens on the same screen, the rail's assignee
    // against the thread's authors.
    const files = vueFiles().filter(f => !f.endsWith('app/components/ui/Avatar.vue'))

    const bare = files.filter(f => /<UAvatar\b/.test(readFileSync(f, 'utf8')))

    expect(bare.map(f => f.replace(ROOT + '/', ''))).toEqual([])
  })
})

/**
 * A raw `<button>` does not re-implement a `UButton`.
 *
 * `app.config.ts` says the button theme "matches what ~50 hand-rolled `<button>`s
 * were doing by hand" — the convergence was done in the theme and the originals
 * were never deleted, so the app carried both. Measured before this guard: twelve
 * hand-rolled Cancels in four sizes, sitting beside eight real ones. Eight of the
 * twelve were byte-identical to `size="md"` once the theme's `rounded-lg
 * font-semibold` is added; the other four were off the ramp entirely, including a
 * `px-3 py-1.5` that exists at no size.
 *
 * The mechanism is the ramp itself, read out of Nuxt UI's own theme module rather
 * than copied here — copying it would restate the value this is supposed to
 * recompute, and would keep passing after a version bump moved the padding.
 *
 * Two shapes are excluded structurally rather than by name, because neither is a
 * button wearing button geometry by accident:
 *
 *   rounded-full  a pill — the app themes `badge` for these, and the filter
 *                 toggles and tag chips are all rounded-full by intent
 *   w-full        a full-bleed row — a popover menu item or a list row, whose
 *                 padding belongs to the row rhythm and not to a control
 *
 * That leaves the exemption list to carry only genuine arguments.
 */
describe('one button vocabulary', () => {
  /** Every raw `<button>` in `app/`, as `{ file, line, classTokens }`. */
  function rawButtons() {
    return vueFiles().flatMap((file) => {
      const src = markup(file)
      const start = src.indexOf('<template>')
      if (start < 0) return []
      const tpl = src.slice(start)

      return [...tpl.matchAll(/<button\b/g)].map((m) => {
        const close = tpl.indexOf('>', m.index)
        const tag = tpl.slice(m.index, close === -1 ? m.index + 900 : close)
        return {
          file: file.replace(ROOT + '/', ''),
          line: src.slice(0, start + m.index).split('\n').length,
          tokens: new Set((tag.match(/\bclass="([\s\S]*?)"/)?.[1] ?? '').split(/\s+/).filter(Boolean))
        }
      })
    })
  }

  /**
   * `{ xs: ['px-2', 'py-1', 'text-xs'], … }` straight out of the installed theme.
   *
   * The module carries a content hash in its filename, so it is found by shape
   * rather than by path — and a miss throws instead of returning an empty ramp,
   * because a guard that silently checks nothing is worse than no guard.
   */
  function sizeRamp(): Record<string, string[]> {
    const dir = join(ROOT, 'node_modules/@nuxt/ui/dist/shared')
    const files = execSync(`ls ${dir}`, { encoding: 'utf8' }).trim().split('\n')

    for (const name of files) {
      const src = readFileSync(join(dir, name), 'utf8')
      const at = src.indexOf('const button = (options)')
      if (at < 0) continue

      const block = src.slice(at, at + 3000).match(/size: \{[\s\S]*?\n {4}\}/)?.[0]
      if (!block) continue

      const ramp: Record<string, string[]> = {}
      for (const m of block.matchAll(/(\w+): \{\s*base: "([^"]+)"/g)) {
        ramp[m[1]!] = m[2]!.split(/\s+/).filter(t => /^(px|py|text)-/.test(t))
      }
      if (Object.keys(ramp).length) return ramp
    }

    throw new Error('could not read the UButton size ramp out of @nuxt/ui — this guard is checking nothing')
  }

  it('reads a ramp that actually looks like one', () => {
    // The guard's own input, asserted before it is trusted: five sizes, each with
    // a horizontal padding, a vertical padding and a text step.
    const ramp = sizeRamp()

    expect(Object.keys(ramp).sort()).toEqual(['lg', 'md', 'sm', 'xl', 'xs'])
    for (const [size, triple] of Object.entries(ramp)) {
      expect(triple.filter(t => t.startsWith('px-')), size).toHaveLength(1)
      expect(triple.filter(t => t.startsWith('py-')), size).toHaveLength(1)
      expect(triple.filter(t => t.startsWith('text-')), size).toHaveLength(1)
    }
  })

  it('no raw button wears a UButton size', () => {
    /** Each entry is an argument, not a suppression. */
    const HAND_ROLLED: Record<string, string> = {
      'app/components/DescriptionEditor.vue':
        'the AI decline button, inside the editor toolbar — the whole editor is '
        + 'being replaced by the WYSIWYG rewrite (CF-7), which owns its toolbar '
        + 'vocabulary. Re-theming it here would be work thrown away twice.'
    }

    const ramp = sizeRamp()
    const offenders = rawButtons().flatMap(({ file, line, tokens }) => {
      if (tokens.has('rounded-full') || tokens.has('w-full')) return []
      const size = Object.entries(ramp)
        .find(([, triple]) => triple.every(t => tokens.has(t)))?.[0]
      return size && !(file in HAND_ROLLED) ? [`${file}:${line}  is UButton size="${size}"`] : []
    })

    expect(offenders, 'reach for UButton, or add the reason it cannot be one').toEqual([])
  })

  it('every hand-rolled exemption is still hand-rolled', () => {
    // The other direction, and the one that rots: an entry that no longer matches
    // anything is a claim nobody is checking. `GRADIENT_BRAND_MOMENTS` carries the
    // same pairing for the same reason.
    const HAND_ROLLED = ['app/components/DescriptionEditor.vue']
    const ramp = sizeRamp()

    const stillRaw = new Set(rawButtons()
      .filter(({ tokens }) => !tokens.has('rounded-full') && !tokens.has('w-full'))
      .filter(({ tokens }) => Object.values(ramp).some(triple => triple.every(t => tokens.has(t))))
      .map(b => b.file))

    expect([...stillRaw].sort(), 'an exemption with nothing left to exempt').toEqual(HAND_ROLLED.sort())
  })
})
