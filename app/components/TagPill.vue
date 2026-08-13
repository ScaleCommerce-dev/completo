<script setup lang="ts">
/**
 * The canonical coloured pill. Tag and status colours are user-chosen hex, so
 * the readable foreground/fill/ring are derived in CSS by `.swatch` (main.css)
 * via `color-mix()` — which means one stored hex works on both white and
 * near-black without any colour-mode logic in JS.
 *
 * Before this, the recipe was inlined at six call sites with drifted alphas
 * (`+'25'` with a 1px ring here, `+'22'` with 1.5px there), so the same tag
 * rendered at two different tints on two different screens, and a dark tag
 * colour was unreadable in dark mode.
 *
 * Two variants, because a tag is two different things:
 *
 *  - `solid` — the tag *is* the content. The hub's tag manager, the tag picker.
 *  - `quiet` — the tag is one signal among several on a card or a table row. A
 *    filled pill there outshouts the title it is attached to: six saturated
 *    pills on one board card read as the headline and the actual headline read
 *    as a caption. `quiet` drops the fill and keeps the hairline, so the shape
 *    survives and the ink does not.
 *
 * `quiet` was a 5px dot plus grey text, which was quieter still but asked the
 * reader to bind the two by proximity alone — at `gap-1` inside a tag and
 * `gap-2` between them, "dot name dot name" is four things a third of a second
 * apart, and the only cue that says which name owns which colour is 4px of
 * whitespace. The outline closes the shape, so a tag is one object again, and it
 * gives the hue a 60px edge to be recognised on instead of 25 square pixels —
 * which is what separates two blues at a glance.
 *
 * Neither variant transforms the name. `uppercase` is what made these shout,
 * not the letters the user typed — and it lied about the data: a tag authored
 * "UX/UI" and one authored "ux/ui" rendered identically.
 */
withDefaults(defineProps<{
  name: string
  color: string
  size?: 'sm' | 'lg'
  variant?: 'solid' | 'quiet'
}>(), {
  size: 'sm',
  variant: 'solid'
})
</script>

<template>
  <span
    v-if="variant === 'quiet'"
    class="swatch-outline inline-flex items-center rounded-full font-medium leading-none min-w-0 max-w-full"
    :class="size === 'sm' ? 'px-1.5 py-[3px] text-2xs' : 'px-2 py-[3px] text-xs'"
    :style="{ '--swatch': color }"
  >
    <span class="truncate"><slot>{{ name }}</slot></span>
  </span>

  <span
    v-else
    class="swatch inline-flex items-center rounded-full font-semibold leading-none"
    :class="size === 'sm' ? 'px-1.5 py-[3px] text-2xs' : 'px-2.5 py-1 text-xs'"
    :style="{ '--swatch': color }"
  >
    <slot>{{ name }}</slot>
  </span>
</template>
