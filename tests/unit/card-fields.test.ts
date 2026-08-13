import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CARD_FIELDS,
  isCardField,
  normalizeHiddenCardFields,
  cardFieldVisible
} from '../../shared/utils/card-fields'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Same guard as `list-fields.test.ts`: one declaration of what a board card can
 * show, and a test that notices when a consumer starts keeping its own copy.
 * Boards previously carried a boolean column per field, so every new element
 * meant a migration and six hand edits — the shape that had already let the list
 * columns drift twice.
 */
describe('card field registry', () => {
  it('declares the eight things a card paints', () => {
    expect(CARD_FIELDS.map(f => f.key)).toEqual([
      'description',
      'assignee',
      'tags',
      'dueDate',
      'ticketId',
      'priority',
      'commentCount',
      'attachmentCount'
    ])
  })

  it('gives every field a label for the settings grid', () => {
    for (const field of CARD_FIELDS) {
      expect(field.label.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate keys', () => {
    expect(new Set(CARD_FIELDS.map(f => f.key)).size).toBe(CARD_FIELDS.length)
  })
})

describe('normalizeHiddenCardFields', () => {
  it('keeps known keys', () => {
    expect(normalizeHiddenCardFields(['tags', 'priority'])).toEqual(['priority', 'tags'])
  })

  it('drops keys this release has never heard of', () => {
    // A board saved by a newer version should lose that one setting, not fail to
    // load — and an unknown value must never reach the card face.
    expect(normalizeHiddenCardFields(['tags', 'somethingNew'])).toEqual(['tags'])
  })

  it('sorts, so a no-op save is not a change', () => {
    expect(normalizeHiddenCardFields(['tags', 'assignee'])).toEqual(['assignee', 'tags'])
  })

  it('deduplicates', () => {
    expect(normalizeHiddenCardFields(['tags', 'tags'])).toEqual(['tags'])
  })

  it('treats anything that is not an array as nothing hidden', () => {
    expect(normalizeHiddenCardFields(null)).toEqual([])
    expect(normalizeHiddenCardFields('tags')).toEqual([])
    expect(normalizeHiddenCardFields({ tags: true })).toEqual([])
  })

  it('rejects non-strings inside the array', () => {
    expect(normalizeHiddenCardFields(['tags', 3, null, undefined])).toEqual(['tags'])
  })
})

describe('cardFieldVisible', () => {
  it('shows everything for a board that has never been configured', () => {
    // The stored set is what is *off*, so null and [] both mean "show it all" —
    // which is also what makes a field added in a later release appear on every
    // existing board instead of being hidden by omission.
    for (const field of CARD_FIELDS) {
      expect(cardFieldVisible(null, field.key)).toBe(true)
      expect(cardFieldVisible([], field.key)).toBe(true)
    }
  })

  it('hides only what is named', () => {
    expect(cardFieldVisible(['tags'], 'tags')).toBe(false)
    expect(cardFieldVisible(['tags'], 'priority')).toBe(true)
  })
})

describe('isCardField', () => {
  it('accepts declared keys and nothing else', () => {
    expect(isCardField('tags')).toBe(true)
    expect(isCardField('status')).toBe(false)
    expect(isCardField(7)).toBe(false)
  })
})

/**
 * The settings grid renders straight from `CARD_FIELDS`, and the card reads each
 * one through `shows(...)`. A field declared but never consulted would appear as
 * a switch that does nothing, which is worse than no switch at all.
 */
describe('every declared field is honoured by the card', () => {
  const card = readFileSync(join(ROOT, 'app/components/KanbanCard.vue'), 'utf8')

  it.each(CARD_FIELDS.map(f => f.key))('%s is read somewhere in KanbanCard', (key) => {
    expect(card).toContain(`'${key}'`)
  })
})
