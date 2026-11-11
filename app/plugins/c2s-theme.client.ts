/**
 * The two attributes the connect2scale guideline hangs its theme and focus
 * model on, kept on `<html>`.
 *
 * `class="c2s-theme" data-theme="light|dark"` — the guideline's content tokens
 * are scoped to `.c2s-theme[data-theme]`, and every portal (dialogs, menus,
 * tooltips) has to carry the same theme. Putting it on `<html>` rather than on
 * the content area means every portal at `<body>` inherits it with no per-portal
 * wiring. The value follows `@nuxtjs/color-mode`'s *resolved* mode, so "system"
 * lands on whichever the OS chose.
 *
 * `data-input-modality="keyboard|pointer"` — the guideline's focus marker
 * depends on how focus arrived (handoff `07-barrierefreiheit.md`): 2px accent
 * after Tab or arrow keys, 1px neutral after a click or tap. Typing into a field
 * after clicking it stays `pointer`; only navigation keys switch back, so the
 * marker never flips mid-word. `main.css` › FOCUS reads it.
 */
const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'])

export default defineNuxtPlugin(() => {
  const root = document.documentElement
  const colorMode = useColorMode()

  root.classList.add('c2s-theme')
  watchEffect(() => {
    root.dataset.theme = colorMode.value === 'dark' ? 'dark' : 'light'
  })

  root.dataset.inputModality = 'pointer'
  window.addEventListener('keydown', (e) => {
    if (NAVIGATION_KEYS.has(e.key)) root.dataset.inputModality = 'keyboard'
  }, { capture: true })
  window.addEventListener('pointerdown', () => {
    root.dataset.inputModality = 'pointer'
  }, { capture: true })
})
