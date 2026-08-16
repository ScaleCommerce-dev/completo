<script setup lang="ts">
/**
 * The accent strip down the left edge of a project or view card.
 *
 * Deliberately *not* on the swatch recipe, and that is the whole point of this
 * file. The recipe exists to make an **arbitrary user-chosen hex** readable by
 * forcing its lightness — `COLOR_PALETTE` offers dark entries on purpose, so a
 * tag label has to be defended against whatever someone picked. `ACCENT_COLORS`
 * is the opposite: a fixed ramp this repo curated, never user input, with
 * nothing drawn on top of it. There is nothing to defend against, and forcing
 * the lightness only destroys the variety the ramp was tuned for.
 *
 * Measured, because this was consolidated onto `.swatch-bar` once and it looked
 * wrong: at L 0.62 amber moves −0.149, cyan −0.095 and emerald −0.076, so three
 * of eight accents come back muddy while the rest barely move. That is a ramp
 * flattened to one lightness for no benefit.
 *
 * The icon tile beside this *does* keep `.swatch`, and the split is by whether
 * anything is drawn on the colour: the tile has an icon on its tint and measured
 * ~2.2:1 as a raw hex on its own 8% wash, this strip has nothing on it at all.
 *
 * `z-10` because the card it belongs to is `position: relative` on the project
 * page: a later positioned sibling paints over an earlier one, so an opaque
 * `bg-default` card hid this completely except for the rounded corner. A strip
 * rather than a border so the card's own hairline stays uniform underneath.
 *
 * `aria-hidden`: the colour repeats the record's identity, which its name
 * already carries. Announcing it would add noise, not information.
 */
defineProps<{
  /** One of `ACCENT_COLORS` — `accentFor(record)` in practice. */
  color: string
}>()
</script>

<template>
  <span
    class="absolute left-0 inset-y-0 z-10 w-[3px] rounded-l-xl"
    :style="{ backgroundColor: color }"
    aria-hidden="true"
  />
</template>
