<script setup lang="ts">
/**
 * The coloured dot that stands for a status.
 *
 * Reimplemented at eight call sites with drifting sizes (`w-2`, `w-2.5`,
 * `w-3.5`) and an inconsistent contrast ring — present in StatusManager,
 * ViewConfigModal and ColorPicker, absent everywhere else, which meant a pale
 * status colour disappeared against a white surface on some screens but not
 * others. The ring now comes from `.swatch-dot`, derived from the colour itself.
 *
 * `done` swaps the dot for a check, since the done status is the one status whose
 * meaning is fixed and worth marking differently.
 */
withDefaults(defineProps<{
  color?: string | null
  done?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  size: 'md'
})

const SIZES = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3'
}

const ICON_SIZES = {
  sm: 'text-2xs',
  md: 'text-xs',
  lg: 'text-sm'
}
</script>

<template>
  <UIcon
    v-if="done"
    name="i-lucide-circle-check-big"
    class="shrink-0 text-success"
    :class="ICON_SIZES[size]"
  />
  <span
    v-else
    class="swatch-dot rounded-full shrink-0"
    :class="SIZES[size]"
    :style="{ '--swatch': color || 'var(--ui-text-dimmed)' }"
  />
</template>
