<script setup lang="ts">
/**
 * The accent strip down the left edge of a project or view card.
 *
 * Three sites drew this by hand as `borderLeftColor: <raw hex>`, which is the
 * bug the swatch recipe was built to end: a stored hex applied untouched is only
 * as readable as the colour someone happened to pick, and `ACCENT_COLORS` offers
 * saturated mid-tones on purpose. `.swatch-bar` sets the *lightness* and keeps
 * the hue (`oklch(from var(--swatch) L c h)`), so the strip reads at one weight
 * across all eight entries and in both colour modes — and it was declared with
 * zero call sites until this component.
 *
 * A strip rather than a border because `.swatch-bar` paints a background: it
 * overlays the card's own hairline on that edge instead of replacing it, so the
 * border stays uniform underneath and only the accent changes.
 *
 * `aria-hidden`: the colour repeats the record's identity, which its name
 * already carries. Announcing it would add noise, not information.
 */
defineProps<{
  /** Any stored hex — `accentFor(record)` in practice. */
  color: string
}>()
</script>

<template>
  <span
    class="swatch-bar absolute left-0 inset-y-0 w-[3px] rounded-l-xl"
    :style="{ '--swatch': color }"
    aria-hidden="true"
  />
</template>
