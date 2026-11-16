import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Every control has a name a screen reader can announce.
 *
 * An icon-only `<button>`, `<UButton icon>` or `<NuxtLink>` is announced as
 * "button" and nothing else, and `UTooltip` does not fix that: it shows text on
 * hover but does not label its trigger. Thirty such controls had accumulated
 * (formatting toolbars, colour swatches, inline save/cancel, copy buttons), most
 * of them inside a tooltip that already said what they did.
 *
 * Derived from the templates: a control counts as named when it carries
 * `aria-label`, `label`, `aria-labelledby` or `v-bind`, or when its content has
 * text, an interpolation, a slot or a child with a `label` prop.
 */
const FILES = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' }).trim().split('\n')

function tagEnd(s: string, from: number): number {
  let quote: string | null = null
  for (let i = from; i < s.length; i++) {
    const c = s[i]!
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === '\'') {
      quote = c
    } else if (c === '>') {
      return i
    }
  }
  return -1
}

function unnamedControls(file: string): string[] {
  const s = readFileSync(file, 'utf8')
  const templateStart = s.indexOf('<template')
  if (templateStart < 0) return []
  const found: string[] = []
  for (const m of s.matchAll(/<(button|UButton|NuxtLink)\b/g)) {
    if (m.index! < templateStart) continue
    const name = m[1]!
    const end = tagEnd(s, m.index!)
    const tag = s.slice(m.index!, end + 1)
    if (/(?<![\w.-])(:?aria-label|:?label|aria-labelledby)=|v-bind="/.test(tag)) continue

    const selfClosing = tag.endsWith('/>')
    const inner = selfClosing ? '' : s.slice(end + 1, s.indexOf(`</${name}>`, end))
    if (/<slot|<template|\slabel=/.test(inner)) continue
    const text = inner.replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, 'x').trim()
    if (text) continue
    // A UButton with neither an icon nor content is not icon-only; it is a styled
    // wrapper whose name comes from elsewhere, and out of scope here.
    if (name === 'UButton' && !/\bicon\b/.test(tag)) continue

    found.push(`${relative(ROOT, file)}:${s.slice(0, m.index).split('\n').length} <${name}>`)
  }
  return found
}

describe('icon-only controls', () => {
  it('scans the app', () => {
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('all carry an accessible name', () => {
    expect(FILES.flatMap(unnamedControls)).toEqual([])
  })
})
