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
  priorityLabel
} from '../../app/utils/constants'

const ROOT = join(import.meta.dirname, '../..')

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
describe('brand configuration', () => {
  const appConfig = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')

  it('declares indigo as primary, matching the logo and the migrated utilities', () => {
    expect(appConfig).toMatch(/primary:\s*'indigo'/)
  })

  it('declares zinc as neutral, so --ui-color-neutral-* equals --color-zinc-*', () => {
    expect(appConfig).toMatch(/neutral:\s*'zinc'/)
  })

  it('declares violet as secondary, the marker for AI-assisted surfaces', () => {
    expect(appConfig).toMatch(/secondary:\s*'violet'/)
  })
})

describe('semantic surface tokens', () => {
  // Anything matched here is a surface colour that will not follow the theme and
  // must be maintained twice, once per colour mode. Two families are exempt:
  // solid `bg-indigo-*` on the remaining hand-rolled buttons (tracked
  // separately), and the deliberate brand gradients on the logo and auth page.
  const OFFENDERS = /(?:dark:|hover:|group-hover:|focus:)*(?:bg|text|border|divide)-(?:zinc|slate)-[0-9]{2,3}/

  it('no template paints a surface with a raw zinc or slate utility', () => {
    const files = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' })
      .trim()
      .split('\n')

    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(OFFENDERS)
        if (m) offenders.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${m[0]}`)
      })
    }

    expect(offenders).toEqual([])
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
    expect(priorityTextClass('low')).toBe('text-dimmed')
    expect(priorityTextClass('medium')).toBe('text-muted')
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
    expect(priorityTextClass('bogus')).toBe('text-dimmed')
    expect(priorityBarClass('bogus')).toBe('')
    expect(priorityIcon('bogus')).toBe('i-lucide-equal')
  })
})

describe('type scale', () => {
  it('leaves no arbitrary font sizes in templates', () => {
    // 726 inline `text-[Npx]` values spanned nineteen sizes, nine of them
    // half-pixel nudges for one specific element. Six named steps replace them.
    const files = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' })
      .trim()
      .split('\n')

    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(/text-\[\d+(\.\d+)?px\]/)
        if (m) offenders.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${m[0]}`)
      })
    }

    expect(offenders).toEqual([])
  })

  it('defines exactly the steps that deviate from Tailwind', () => {
    const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
    expect(css).toMatch(/--text-2xs:\s*0\.625rem/) // 10px, added
    expect(css).toMatch(/--text-sm:\s*0\.8125rem/) // 13px, was 14
    expect(css).toMatch(/--text-base:\s*0\.875rem/) // 14px, was 16
    expect(css).toMatch(/--text-lg:\s*1rem/) // 16px, was 18
    // xs keeps Tailwind's 12px so Nuxt UI internals relying on it are untouched.
    expect(css).not.toMatch(/--text-xs:/)
  })
})

describe('main.css token layer', () => {
  const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')

  it('defines elevation per colour mode', () => {
    // Every shadow used to be a light-mode black alpha with no dark variant, so
    // cards lifted on hover with no depth cue at all on a dark surface.
    for (const name of ['--elevation-raise', '--elevation-float', '--elevation-drag']) {
      const defs = css.match(new RegExp(`${name}:`, 'g')) || []
      expect(defs.length, `${name} needs a light and a dark definition`).toBeGreaterThanOrEqual(2)
    }
  })

  it('derives the focus ring from the brand rather than a fixed hue', () => {
    expect(css).toMatch(/:focus-visible[\s\S]*?outline:\s*2px solid var\(--ui-primary\)/)
  })

  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('derives swatch colours per mode so one stored hex works on both', () => {
    expect(css).toMatch(/\.swatch[\s\S]*?color-mix\(in oklab, var\(--swatch\)/)
    expect(css).toMatch(/:is\(\.dark\) \.swatch/)
  })
})
