<script setup lang="ts">
/**
 * The commit shortcut, in one spelling.
 *
 * `UiKey` draws a single key; this draws the *combination* a commit button
 * announces, which is the thing that kept being respelled. `SaveBar` hid the keys
 * under `max-sm:hidden` and the five buttons that inlined the same pair did not,
 * so the app showed a ⌘ on phones in five places and hid it in one — with no
 * decision behind the split, just five copies of a `#trailing` block made before
 * the responsive rule existed.
 *
 * Hidden below `sm` because the keys are a hint about a keyboard, and a soft
 * keyboard has no ⌘ and a return key that inserts a newline. The button still
 * works; it just stops advertising a chord nobody there can press.
 *
 * `inheritAttrs: false` because the root is a fragment — a stray `class` would
 * have nowhere to land and Vue would warn. Position it from the parent instead.
 */
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  /** `enter` for a bare ⏎, as the board's quick-add composer commits. */
  keys?: 'meta-enter' | 'enter'
}>(), {
  keys: 'meta-enter'
})
</script>

<template>
  <UiKey
    v-if="keys === 'meta-enter'"
    value="meta"
    class="max-sm:hidden"
  />
  <UiKey
    value="enter"
    class="max-sm:hidden"
  />
</template>
