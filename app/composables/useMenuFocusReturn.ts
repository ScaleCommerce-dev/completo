/**
 * Whether a menu should hand focus back to its trigger when it closes.
 *
 * Reka restores focus to the trigger on close, which is right for someone who
 * opened the menu with the keyboard — without it, the next Tab starts from the
 * top of the document. For someone who opened it with the mouse it is wrong in a
 * way that shows: Escape is itself a keypress, so the browser upgrades the
 * restored focus to `:focus-visible` and a ring appears around an icon the user
 * never tabbed to. Clicking elsewhere to dismiss left no ring, so the same
 * dismissal produced two different results depending on how you did it.
 *
 * The answer is not to drop the ring — it is the only thing marking where a
 * keyboard user is. It is to notice how the menu was opened and only restore
 * focus in the case that wants it.
 *
 * Modality has to be sampled when the menu *opens*, not when it closes: by close
 * time the Escape keypress has already flipped it to keyboard.
 */

type Modality = 'pointer' | 'keyboard'

let modality: Modality = 'pointer'
let listening = false

/** One pair of listeners for the whole app, however many menus are mounted. */
function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pointerdown', () => {
    modality = 'pointer'
  }, true)
  window.addEventListener('keydown', (e) => {
    // A bare modifier is someone reaching for a shortcut, not navigating.
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) modality = 'keyboard'
  }, true)
}

export function useMenuFocusReturn(isOpen: Ref<boolean | undefined>) {
  listen()

  const openedWith = ref<Modality>('pointer')

  watch(isOpen, (open) => {
    if (open) openedWith.value = modality
  })

  /**
   * Reka's `closeAutoFocus`. Preventing it leaves focus where clicking outside
   * would have left it — on nothing.
   */
  function onCloseAutoFocus(e: Event) {
    if (openedWith.value === 'pointer') e.preventDefault()
  }

  return { onCloseAutoFocus }
}
