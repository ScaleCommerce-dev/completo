import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * An optional `boolean` prop is never `undefined`.
 *
 * Vue casts an absent Boolean prop to `false` unless the prop declares a default,
 * so `props.searchable ?? fallback` never reaches its fallback. That is how
 * `FieldMenu`'s search row, meant to appear past ten entries, never appeared at
 * all while every caller that forced it on still worked. A prop that means "on,
 * off, or decide for me" needs `withDefaults(defineProps<...>(), { name: undefined })`:
 * a declared default is what Vue reads as "do not cast".
 *
 * This finds every optional `boolean` in a `defineProps` type literal that the
 * script reads as three-state (`??`, or a comparison with `undefined` or `null`)
 * and requires that default beside it.
 */

const FILES = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' }).trim().split('\n')

/**
 * Debt, not exemptions: each entry is a live instance of the bug that predates
 * the guard. Asserted both ways, so fixing one and leaving its entry fails too.
 */
const OWED: Record<string, string[]> = {
  // "Defaults to on for the card surfaces", but the card panel's ID pill passes
  // nothing, so it has never shown the slide-out copy buttons. Fixing it changes
  // what the panel shows, which is a design call rather than part of this guard.
  'app/components/TicketIdCopy.vue': ['copyButtons']
}

function threeStateBooleans(src: string): string[] {
  const literal = src.match(/defineProps<\{([\s\S]*?)\}>\(\)/)?.[1]
  if (!literal) return []
  const defaults = src.match(/withDefaults\(\s*defineProps<\{[\s\S]*?\}>\(\),\s*\{([\s\S]*?)\}\s*\)/)?.[1] ?? ''
  return [...literal.matchAll(/^\s*(\w+)\?:\s*boolean\s*$/gm)]
    .map(m => m[1]!)
    .filter(name => new RegExp(`props\\.${name}\\s*(\\?\\?|[!=]==?\\s*(undefined|null)\\b)`).test(src))
    .filter(name => !new RegExp(`\\b${name}:\\s*undefined\\b`).test(defaults))
}

describe('optional boolean props read as three-state', () => {
  const found: Record<string, string[]> = {}
  for (const file of FILES) {
    const names = threeStateBooleans(readFileSync(file, 'utf8'))
    if (names.length) found[relative(ROOT, file)] = names
  }

  it('declare `undefined` as their default, or Vue reads an absent one as false', () => {
    const unexpected = Object.fromEntries(Object.entries(found).filter(([file]) => !OWED[file]))
    expect(unexpected).toEqual({})
  })

  it('keeps the debt list honest: every entry is still owed', () => {
    expect(Object.fromEntries(Object.entries(found).filter(([file]) => OWED[file]))).toEqual(OWED)
  })
})
