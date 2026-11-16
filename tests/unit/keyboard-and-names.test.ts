import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Controls that a keyboard could not reach or a screen reader could not name.
 * Each was checked in a browser when fixed; what is pinned here is the mechanism,
 * since the unit project cannot mount these components.
 */
const ROOT = join(import.meta.dirname, '../..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

describe('dialogs are named by their visible title', () => {
  // Overriding UModal's #header removed the only DialogTitle, while the dialog kept
  // aria-labelledby pointing at its id: every dialog was an unnamed "dialog".
  const modal = code('app/components/ui/Modal.vue')

  it('gives the heading and description the ids the dialog points at', () => {
    expect(modal).toMatch(/closest\('\[role="dialog"\]'\)\?\.getAttribute\(attr\)/)
    expect(modal).toMatch(/<h2\s+:ref="titleRef"/)
    expect(modal).toMatch(/:ref="descriptionRef"/)
  })

  it('does not import reka-ui, whose second instance would not see the dialog', () => {
    expect(modal).not.toMatch(/from 'reka-ui'/)
  })
})

it('the notification bell is one named link', () => {
  const bell = code('app/components/NotificationBell.vue')
  expect(bell).not.toMatch(/<NuxtLink/)
  expect(bell).toMatch(/<UButton\s+to="\/notifications"/)
  expect(bell).toMatch(/:aria-label="label"/)
  expect(bell).toMatch(/bg-accent text-on-accent/)
})

it('an inline confirmation takes focus, and hands it back when dismissed', () => {
  const confirm = code('app/components/ui/InlineConfirm.vue')
  expect(confirm).toMatch(/onMounted\([\s\S]*?\.focus\(\)/)
  expect(confirm).toMatch(/onBeforeUnmount\([\s\S]*?contains\(document\.activeElement\)[\s\S]*?\.focus\(\)/)
})

it('the ticket id is a button that copies its link', () => {
  const ticket = code('app/components/TicketIdCopy.vue')
  expect(ticket).toMatch(/<button[^>]*:aria-label="`Copy link to \$\{formatTicketId/)
  expect(ticket).toMatch(/group-focus-within\/copy:opacity-100/)
})

it('the icon picker opens from the keyboard', () => {
  expect(code('app/components/ProjectIconPicker.vue')).toMatch(/<button\s+type="button"[^>]*:aria-expanded="showIconPicker"/)
})

it('the list Done control is a named checkbox with a state', () => {
  const done = code('app/components/list/ListCellDone.vue')
  expect(done).toMatch(/role="checkbox"/)
  expect(done).toMatch(/:aria-checked="isDone"/)
  expect(done).toMatch(/:aria-label="label"/)
})

it('the add-people search is a combobox whose options work by click', () => {
  const members = code('app/components/ProjectMembers.vue')
  expect(members).toMatch(/role="combobox"/)
  expect(members).toMatch(/:aria-activedescendant="activeDescendant"/)
  expect(members).toMatch(/role="listbox"/)
  // Options act on click; mousedown only keeps focus in the field.
  expect(members).not.toMatch(/@mousedown\.prevent="/)
  expect(members).toMatch(/@click="addMember\(u\)"/)
})
