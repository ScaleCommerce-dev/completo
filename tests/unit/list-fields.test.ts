import { describe, it, expect } from 'vitest'
import {
  LIST_FIELDS,
  LIST_FIELD_KEYS,
  SORTABLE_LIST_FIELDS,
  LIST_FIELD_LABELS,
  LIST_FIELD_WIDTHS,
  LIST_DEFAULT_FIELDS,
  MY_TASKS_DEFAULT_FIELDS,
  isListField
} from '../../shared/utils/list-fields'

/**
 * These guard the single source of truth, not the derivations — everything else is
 * computed from LIST_FIELDS, so the remaining way to break list columns is a bad entry
 * here (a typo'd key, a field marked sortable that ListView can't sort, a default naming
 * a field that doesn't exist). That used to be nine hand-maintained arrays; two had
 * already drifted apart. See the header comment in shared/utils/list-fields.ts.
 */
describe('list field definitions', () => {
  it('has no duplicate keys', () => {
    expect(new Set(LIST_FIELD_KEYS).size).toBe(LIST_FIELD_KEYS.length)
  })

  it('gives every field a key, label and icon', () => {
    for (const f of LIST_FIELDS) {
      expect(f.field, `field key: ${JSON.stringify(f)}`).toBeTruthy()
      expect(f.label, `label for ${f.field}`).toBeTruthy()
      expect(f.icon, `icon for ${f.field}`).toMatch(/^i-lucide-/)
    }
  })

  it('only marks real fields as sortable', () => {
    for (const field of SORTABLE_LIST_FIELDS) {
      expect(LIST_FIELD_KEYS, `sortable field ${field}`).toContain(field)
    }
  })

  it('only names real fields in the default column sets', () => {
    for (const field of [...LIST_DEFAULT_FIELDS, ...MY_TASKS_DEFAULT_FIELDS]) {
      expect(LIST_FIELD_KEYS, `default field ${field}`).toContain(field)
    }
  })

  it('labels every field for the table header', () => {
    // `done` renders an icon instead of text, so its label is intentionally empty —
    // present-but-empty is the assertion, not truthy.
    for (const field of LIST_FIELD_KEYS) {
      expect(LIST_FIELD_LABELS, `header label for ${field}`).toHaveProperty(field)
    }
    expect(LIST_FIELD_LABELS.done).toBe('')
    expect(LIST_FIELD_LABELS.ticketId).toBe('ID')
  })

  it('sizes every column except title, which flexes', () => {
    for (const field of LIST_FIELD_KEYS) {
      if (field === 'title') {
        expect(LIST_FIELD_WIDTHS).not.toHaveProperty('title')
      } else {
        expect(LIST_FIELD_WIDTHS, `width for ${field}`).toHaveProperty(field)
      }
    }
  })

  it('accepts known fields and rejects everything else', () => {
    expect(isListField('creator')).toBe(true)
    expect(isListField('dueDate')).toBe(true)
    expect(isListField('creatorId')).toBe(false)
    expect(isListField('')).toBe(false)
    expect(isListField(null)).toBe(false)
    expect(isListField(42)).toBe(false)
  })

  it('keeps dueDate sortable', () => {
    // Regression: dueDate was sortable in ListView but missing from the server's set, so
    // clicking the Due Date header sorted the rows and then failed with "Invalid sort
    // field". Both now read this one set.
    expect(SORTABLE_LIST_FIELDS.has('dueDate')).toBe(true)
  })

  it('offers done as a column', () => {
    // Regression: done was in ViewConfigModal's list but not CreateViewModal's, so the
    // checkbox column could only be added after the list already existed.
    expect(LIST_FIELD_KEYS).toContain('done')
  })
})
