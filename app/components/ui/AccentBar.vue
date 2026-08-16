<script setup lang="ts">
/**
 * The left-edge accent on a project or view card.
 *
 * **Geometry is the ticket card's, and it is a rule rather than a measurement:**
 * the bar is a *child* of the bordered surface, and the surface clips it. So it
 * carries no radius of its own, sits inside the border, and tapers with whatever
 * corner the card has — `rounded-lg` on a ticket card, `rounded-xl` here.
 *
 * The version this replaces was a sibling with `rounded-l-xl`, faking the
 * corner. That is wrong twice over: it bulged past the curve, and a single fake
 * radius cannot be right on two different cards. It also sat outside the border
 * rather than inside it, so the same device read differently on the board and on
 * the project page. The host needs `relative overflow-hidden` — the clip is what
 * does the work.
 *
 * **Colour is deliberately not the swatch recipe.** That recipe forces lightness
 * to make an *arbitrary user-chosen hex* readable; `ACCENT_COLORS` is a ramp this
 * repo curates, never user input, with nothing drawn on top of it. Forcing L 0.62
 * costs amber 0.149 and cyan 0.095 — a curated ramp flattened to defend against
 * input that cannot occur here. The icon tile beside this *does* keep `.swatch`,
 * because an icon is drawn on its tint; the split is by whether anything is drawn
 * on the colour.
 *
 * `aria-hidden`: the colour repeats the record's identity, which its name already
 * carries. Announcing it would add noise, not information.
 */
defineProps<{
  /** One of `ACCENT_COLORS` — `accentFor(record)` in practice. */
  color: string
}>()
</script>

<template>
  <span
    class="absolute left-0 top-0 bottom-0 w-accent-bar"
    :style="{ backgroundColor: color }"
    aria-hidden="true"
  />
</template>
