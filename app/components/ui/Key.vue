<script setup lang="ts">
/**
 * A keyboard key, drawn rather than typed.
 *
 * `UKbd` renders the key as a *character* — ⌘, ↵, ←, ↑ — and neither of this
 * app's fonts contains most of them. Measured in Chrome:
 *
 *   JetBrains Mono     ↑ ok  ↓ ok  ← missing  → missing  ⌘ missing  ↵ missing
 *   Plus Jakarta Sans  ↑ ok  ↓ ok  ← missing  → missing  ⌘ missing  ↵ missing
 *
 * A missing glyph falls back to whatever the operating system offers, which is
 * a different face at a different weight and optical size — so ↑ and ↓ came out
 * crisp while ← and → beside them were a faint smudge, and the result differed
 * between Safari, Chrome and the WebView the app was being reviewed in. That
 * cross-browser inconsistency is the tell: the app never chose those shapes.
 *
 * Icons remove the question. They are vectors we ship, identical everywhere,
 * and they scale properly instead of being drawn for body text at 10px. Keys
 * the fonts *do* cover — letters, digits — stay as characters, because a "K"
 * should look like the K on the keyboard.
 *
 * Note this is the one place arrows are correct rather than misleading: inside a
 * key-shaped box in a tooltip they can only mean the keyboard. On a *control*
 * the app uses chevrons instead, because an arrow beside a card reads as "move
 * this card" — see the nav buttons in `CardModal`.
 */
withDefaults(defineProps<{
  /** A `UKbd` key name: `meta`, `enter`, `arrowup`, or any literal character. */
  value: string
  /**
   * `md` by default, where `UKbd` uses `sm`. A key rendered as an icon needs the
   * extra pixels: `sm` is a 10px glyph, and ⌘ and ↵ lose their shape there while
   * a letter survives it. Callers should not pass `sm` for that reason.
   */
  size?: 'sm' | 'md' | 'lg'
  variant?: 'solid' | 'outline' | 'soft' | 'subtle'
}>(), { size: 'md' })

/** Only the keys whose glyph the fonts lack. Anything else keeps its character. */
const KEY_ICONS: Record<string, string> = {
  meta: 'i-lucide-command',
  enter: 'i-lucide-corner-down-left',
  arrowup: 'i-lucide-arrow-up',
  arrowdown: 'i-lucide-arrow-down',
  arrowleft: 'i-lucide-arrow-left',
  arrowright: 'i-lucide-arrow-right'
}
</script>

<template>
  <UKbd
    v-if="KEY_ICONS[value]"
    :size="size"
    :variant="variant"
  >
    <!--
      Sized in `em`, so the icon tracks whichever `UKbd` size it lands in rather
      than being pinned to one of them. It was a fixed `size-3` — 12px against a
      10px chip — which read heavier than the "K" beside it and forced its chip
      4px wider.

      1em rather than something matched to cap height. Optically a letter fills
      only ~0.71em, so 0.85em looked right on paper and turned ⌘ to mush in
      practice: it is four interlocking loops, and it needs whole pixels for them
      in a way a "K" does not. Matching the font size keeps the two chips the
      same width and leaves the detailed glyphs legible, which is the trade that
      matters — see the default size below for the other half of it.
    -->
    <UIcon
      :name="KEY_ICONS[value]!"
      class="size-[1em]"
    />
  </UKbd>
  <UKbd
    v-else
    :value="value"
    :size="size"
    :variant="variant"
  />
</template>
