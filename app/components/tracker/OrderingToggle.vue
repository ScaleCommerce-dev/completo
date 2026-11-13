<script setup lang="ts">
import type { IssueOrdering } from '~/utils/issue-list'

/**
 * The "Ordering" display option, reduced to its two common choices:
 * Manual, the order people dragged issues into, and Priority. The caller
 * decides where the choice is remembered.
 */
const ordering = defineModel<IssueOrdering>({ required: true })
</script>

<template>
  <UTooltip text="Ordering">
    <UButton
      icon="i-lucide-arrow-down-up"
      :label="ordering === 'manual' ? 'Manual' : 'Priority'"
      variant="ghost"
      color="neutral"
      size="sm"
      @click="ordering = ordering === 'manual' ? 'priority' : 'manual'"
    />
  </UTooltip>
</template>
