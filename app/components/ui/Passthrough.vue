<script setup lang="ts">
/**
 * Renders its default slot and nothing else.
 *
 * A stand-in for an overlay wrapper that has not been needed yet, used through
 * `<component :is>`: `:is="armed ? 'PriorityMenu' : 'UiPassthrough'"` keeps one
 * copy of the trigger markup instead of a `v-if`/`v-else` pair per control.
 *
 * Measured on the board, where `KanbanCard` mounts four of them (see `armed`
 * there): a Reka overlay root costs about 2ms to instantiate and this costs
 * about 0.03ms, which is what makes the swap worth making rather than just
 * moving the work around.
 *
 * `inheritAttrs: false` because everything bound for the real wrapper — its
 * props, its `@update:open` — arrives here as a fallthrough attribute with no
 * element to land on. Dropping them is correct: nothing can be open yet.
 */
defineOptions({ inheritAttrs: false })
</script>

<template>
  <slot />
</template>
