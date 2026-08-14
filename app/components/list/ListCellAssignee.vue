<script setup lang="ts">
defineProps<{
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
  readOnly?: boolean
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [assigneeId: string | null]
  'update:popoverOpen': [open: boolean]
}>()
</script>

<template>
  <div
    v-if="readOnly"
    class="flex items-center min-h-cell"
  >
    <UiPerson
      :person="assignee"
      empty-on-hover
    />
  </div>

  <AssigneeMenu
    v-else
    :members="members"
    :assignee-id="assignee?.id"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', !!$event)"
    @select="emit('select', $event)"
  >
    <template #default="{ label }">
      <!-- A button, not a div: as a div this popover trigger had no tabindex, so
         reassigning a card was impossible without a mouse. -->
      <button
        type="button"
        :aria-label="label"
        class="flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer min-h-cell max-w-full"
        @click.stop
      >
        <UiPerson
          :person="assignee"
          empty-on-hover
        />
        <UIcon
          v-if="assignee"
          name="i-lucide-chevron-down"
          class="text-2xs shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </button>
    </template>
  </AssigneeMenu>
</template>
