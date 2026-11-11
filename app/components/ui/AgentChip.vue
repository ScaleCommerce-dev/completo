<script setup lang="ts">
/**
 * The "Agent" chip that follows an agent's name wherever a name is printed.
 *
 * Secondary, because violet already marks the AI surfaces (`app.config.ts`).
 * Dropped where a group label already says *Agents*, and in a notification, whose
 * message is a sentence the chip would break; there the avatar's shape is the
 * only marker. The tooltip names the person responsible, which is the one thing
 * about an agent a reader of its comment or card might need next.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  managedBy?: { name: string } | null
  /** `true` when the agent is known to have no manager, rather than not loaded. */
  orphaned?: boolean
}>()

const tip = computed(() => {
  if (props.managedBy) return `Managed by ${props.managedBy.name}`
  return props.orphaned ? 'No manager' : ''
})
</script>

<template>
  <UTooltip
    :text="tip"
    :disabled="!tip"
  >
    <UBadge
      v-bind="$attrs"
      color="secondary"
      label="Agent"
      class="shrink-0"
    />
  </UTooltip>
</template>
