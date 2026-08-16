import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CARD_SEARCH_MIN_LENGTH, cardSearchId, descriptionSnippet, isCardSearchable, matchSegments } from '../../shared/utils/card-search'

const ROOT = join(import.meta.dirname, '../..')

/**
 * The rule the command palette and `/api/cards/search` both apply to a query.
 * It lives in `shared/` because two copies of "when is this worth sending"
 * desync silently: a stricter client hides results the API would return, a
 * looser one shows a spinner for a request that can only come back empty.
 */
describe('cardSearchId', () => {
  it('reads the id out of a ticket, whatever case the key is in', () => {
    expect(cardSearchId('TK-42')).toBe(42)
    expect(cardSearchId('tk-42')).toBe(42)
    expect(cardSearchId('  TK-42  ')).toBe(42)
  })

  it('reads a bare number', () => {
    expect(cardSearchId('42')).toBe(42)
    expect(cardSearchId('7')).toBe(7)
  })

  it('is not a substring match — a query that only contains an id is prose', () => {
    expect(cardSearchId('blocked by TK-42')).toBeNull()
    expect(cardSearchId('TK-42 duplicate')).toBeNull()
    expect(cardSearchId('v2 rollout')).toBeNull()
    expect(cardSearchId('TK-')).toBeNull()
    expect(cardSearchId('')).toBeNull()
  })
})

describe('isCardSearchable', () => {
  it('rejects a query too short to mean anything', () => {
    expect(isCardSearchable('')).toBe(false)
    expect(isCardSearchable('   ')).toBe(false)
    expect(isCardSearchable('a')).toBe(false)
  })

  it('accepts a single digit, because that is an id and not a scan', () => {
    expect(isCardSearchable('7')).toBe(true)
  })

  it('accepts anything at or above the floor', () => {
    expect(isCardSearchable('a'.repeat(CARD_SEARCH_MIN_LENGTH))).toBe(true)
    expect(isCardSearchable('parallax hero')).toBe(true)
  })
})

/**
 * The palette's preview pane, which exists because a row cannot say why it is
 * in the list — a card matched on its description looks like a mis-hit until
 * the matched sentence is shown.
 */
describe('descriptionSnippet', () => {
  const long = (word: string) => `${'filler '.repeat(60)}${word} ${'tail '.repeat(60)}`

  it('centres the window on the match rather than starting at the top', () => {
    const snippet = descriptionSnippet(long('needle'), 'needle')!

    expect(snippet).toContain('needle')
    // Elided on both sides: the match is deep in the text and text follows it.
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('keeps context in front of the match, so it reads as a sentence', () => {
    const snippet = descriptionSnippet(long('needle'), 'needle')!
    expect(snippet.indexOf('needle')).toBeGreaterThan(20)
  })

  it('falls back to the opening when nothing matches', () => {
    const snippet = descriptionSnippet(long('needle'), 'absent')!
    expect(snippet.startsWith('filler')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('returns a short description whole, with no ellipsis', () => {
    expect(descriptionSnippet('Ships on Tuesday.', 'tuesday')).toBe('Ships on Tuesday.')
  })

  it('has nothing to say about an empty description', () => {
    expect(descriptionSnippet(null, 'x')).toBeNull()
    expect(descriptionSnippet('', 'x')).toBeNull()
    expect(descriptionSnippet('   \n\n  ', 'x')).toBeNull()
  })

  describe('flattens markdown to prose, because the pane shows a few lines', () => {
    it.each([
      ['heading', '## Requirements\n\nUsers can search.', 'Requirements Users can search.'],
      ['bullets', '- First item\n- Second item', 'First item Second item'],
      ['task boxes', '- [ ] Not done\n- [x] Done', 'Not done Done'],
      ['numbered', '1. First\n2. Second', 'First Second'],
      ['blockquote', '> Quoted line', 'Quoted line'],
      ['emphasis', 'This is **bold** and *italic* and `code`.', 'This is bold and italic and code.'],
      ['links', 'See [the docs](https://example.com/x) for more.', 'See the docs for more.'],
      ['code fences', '```ts\nconst a = 1\n```', 'const a = 1'],
      ['table rows', '| Time | Event |\n|---|---|\n| 02:00 | Export starts |', 'Time | Event 02:00 | Export starts']
    ])('%s', (_name, input, expected) => {
      expect(descriptionSnippet(input, 'nothing')).toBe(expected)
    })

    it('leaves a lone underscore alone — stripping it would rewrite identifiers', () => {
      expect(descriptionSnippet('The card_id column is wrong.', 'card')).toContain('card_id')
    })
  })
})

describe('matchSegments', () => {
  const joined = (text: string, q: string) => matchSegments(text, q).map(s => s.text).join('')

  it('splits into matched and unmatched parts without losing a character', () => {
    for (const [text, q] of [['Editable tables', 'table'], ['aaa', 'a'.repeat(2)], ['no match here', 'zzz']] as const) {
      expect(joined(text, q)).toBe(text)
    }
  })

  it('marks every occurrence, case-insensitively, keeping the original casing', () => {
    const marked = matchSegments('Checksum and checksum', 'checksum').filter(s => s.match)
    expect(marked.map(s => s.text)).toEqual(['Checksum', 'checksum'])
  })

  it('marks a match inside a word, which is the case the pane exists for', () => {
    // "table" is in "editable" — a correct hit that reads as a mis-hit unmarked.
    expect(matchSegments('view name not editable', 'table').filter(s => s.match)).toHaveLength(1)
  })

  it('marks nothing for a one-character query, which named an id, not a substring', () => {
    expect(matchSegments('7 of 7 sevens', '7').some(s => s.match)).toBe(false)
  })

  it('never emits an empty segment', () => {
    for (const [text, q] of [['table', 'table'], ['tabletable', 'table'], ['xtable', 'table']] as const) {
      expect(matchSegments(text, q).every(s => s.text.length > 0)).toBe(true)
    }
  })
})

describe('the rule is single-sourced', () => {
  /**
   * Recomputed rather than restated: both callers must reach the shared module,
   * and neither may re-derive the floor from a literal of its own. A comparison
   * against a bare number in either file is the desync this module prevents.
   */
  const CALLERS = [
    'server/api/cards/search.get.ts',
    'app/composables/useCardSearch.ts'
  ]

  it.each(CALLERS)('%s applies it rather than reimplementing it', (path) => {
    const source = readFileSync(join(ROOT, path), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(source).toMatch(/isCardSearchable\s*\(/)
    expect(source, 'compares a length against a literal instead of using CARD_SEARCH_MIN_LENGTH')
      .not.toMatch(/\.length\s*[<>=]+\s*\d/)
  })
})
