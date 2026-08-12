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
 */
withDefaults(defineProps<{
  name: string
  color: string
  size?: 'sm' | 'lg'
}>(), {
  size: 'sm'
})
</script>

<template>
  <span
    class="swatch inline-flex items-center rounded-full font-bold leading-none tracking-wide uppercase"
    :class="size === 'sm' ? 'px-1.5 py-[3px] text-2xs' : 'px-2.5 py-1 text-xs'"
    :style="{ '--swatch': color }"
  >
    <slot>{{ name }}</slot>
  </span>
</template>
