import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

/**
 * Seven client bugs where the screen and the server disagreed, or a write went to
 * the wrong place. The unit project runs in `node` and these composables lean on
 * Nuxt's auto-imports, so what is pinned is the mechanism each fix depends on:
 * remove it and the bug returns.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const code = (p: string) => read(p).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1')

describe('a failed card save does not look saved', () => {
  it('the panel awaits its host instead of emitting into the void', () => {
    // An emit returns at once, so a failed PUT closed the editor and cleared the
    // draft while the server still held the old text.
    const modal = code('app/components/CardModal.vue')
    expect(modal).toMatch(/onUpdate\?: \(cardId: number/)
    expect(modal).not.toMatch(/emit\('update'/)
    expect(modal).toMatch(/save: updates => props\.onUpdate\?\.\(/)
  })

  it('the editor keeps the draft unless the save went through', () => {
    const editor = code('app/composables/useCardEditor.ts')
    const save = editor.slice(editor.indexOf('async function saveDescription'))
    expect(save.indexOf('if (!await attempt(')).toBeGreaterThan(-1)
    expect(save.indexOf('if (!await attempt(')).toBeLessThan(save.indexOf('descriptionDraft.clear()'))
    // A rejected title is put back, since the property sync leaves titles alone.
    expect(editor).toMatch(/if \(!ok && 'title' in updates\)/)
  })

  it('every host reports failure: the board and list rethrow, My Tasks too, the page returns false', () => {
    // Both views save through `putCardFields`, which reports and then rethrows.
    expect(code('app/utils/write-sequence.ts')).toMatch(/opts\.onError\(e\)\s*throw e/)
    for (const p of ['app/composables/useViewData.ts', 'app/composables/useMyTasks.ts']) {
      expect(code(p), p).toMatch(/putCardFields\(\{/)
      expect(code(p), p).not.toMatch(/catch \(e\) \{\s*\}/)
    }
    expect(code('app/pages/projects/[slug]/cards/[cardId].vue')).toMatch(/syncProperties\(\)\s*return false/)
  })
})

describe('the panel shows the card it is on', () => {
  it.each(['app/composables/useComments.ts', 'app/composables/useAttachments.ts'])('%s drops a response for a card it has left', (p) => {
    const src = code(p)
    expect(src).toMatch(/if \(cardId\.value === id\)/)
    // And a new card starts empty rather than showing the last one's list.
    expect(src).toMatch(/watch\(cardId, \(id\) => \{\s*\w+\.value = \[\]/)
  })
})

describe('view settings write what they show', () => {
  const modal = code('app/components/ViewConfigModal.vue')

  it('sends a pending write when it unmounts while open', () => {
    expect(modal).toMatch(/onBeforeUnmount\(\(\) => \{\s*if \(writeTimer\) flushWrites\(\)/)
  })

  it('compares against what it last sent, not the props the refetch has not updated yet', () => {
    const changed = modal.slice(modal.indexOf('function changedFilters'), modal.indexOf('function flushWrites'))
    expect(changed).toMatch(/sent\.tagFilters/)
    expect(changed).not.toMatch(/props\.active/)
  })
})

it('a second Enter does not mint a second token', () => {
  expect(code('app/composables/useApiTokens.ts')).toMatch(/async function createToken\(\) \{\s*if \(tokenLoading\.value/)
})

it('the password minimum is one number, used by the server and every form that states it', () => {
  const schema = code('shared/schemas/auth.ts')
  expect(schema).toMatch(/\.min\(PASSWORD_MIN_LENGTH/)
  for (const p of ['app/components/profile/ProfileSecurity.vue', 'app/composables/usePasswordChange.ts', 'app/pages/register.vue', 'app/pages/auth/reset-password.vue', 'app/pages/auth/setup-account.vue']) {
    const src = code(p)
    expect(src, p).toMatch(/PASSWORD_MIN_LENGTH/)
    expect(src, p).not.toMatch(/(length\s*[<>]=?\s*\d)|([Mm]in \d+ char)|(least \d+ char)/)
  }
})

it('a comment AI suggestion never streams into the saved draft', () => {
  // `useTextDraft` saves the model, so streaming into it replaced the user's draft.
  const editor = code('app/components/DescriptionEditor.vue')
  expect(editor).toMatch(/useAiDescription\(aiBuffer\)/)
  expect(editor).not.toMatch(/useAiDescription\(description\)/)
  // Posting during review posts what is shown.
  expect(code('app/components/CommentList.vue')).toMatch(/async function submit\(\) \{\s*newCommentEditor\.value\?\.applyPendingAi\(\)/)
})

it('the theme controls save the choice to the account, not only to this browser', () => {
  for (const p of ['app/components/AccountMenu.vue', 'app/layouts/default.vue']) {
    const src = code(p)
    expect(src, p).toMatch(/setTheme\(/)
    expect(src, p).not.toMatch(/colorMode\.preference\s*=[^=]/)
  }
})

it('every clipboard write goes through writeClipboard, which works on plain HTTP', () => {
  // `navigator.clipboard` is undefined outside a secure context, so a direct call
  // threw there, and copying a one-time token did nothing.
  const hits = execSync(`grep -rln "navigator.clipboard" ${join(ROOT, 'app')} || true`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean).map(f => f.replace(ROOT + '/', ''))
  expect(hits).toEqual(['app/utils/clipboard.ts'])
})

it('page titles carry the app name once, from the title template', () => {
  // A bulk edit that removed the per-page suffix also emptied the template's own,
  // and every tab read "Projects" with no app name.
  expect(code('app/app.vue')).toMatch(/titleTemplate:[^\n]*`\$\{title\} · Completo`/)
  const pages = execSync(`grep -rln "· Completo" ${join(ROOT, 'app/pages')} || true`, { encoding: 'utf8' }).trim()
  expect(pages).toBe('')
})
