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
 *    as a caption. The colour still identifies the tag, carried by a 5px dot;
 *    the name goes back to being text.
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
    class="inline-flex items-center gap-1 min-w-0 max-w-full leading-none"
    :style="{ '--swatch': color }"
  >
    <span
      class="swatch-dot size-[5px] rounded-full shrink-0"
      aria-hidden="true"
    />
    <span
      class="truncate font-medium text-muted"
      :class="size === 'sm' ? 'text-2xs' : 'text-xs'"
    ><slot>{{ name }}</slot></span>
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
