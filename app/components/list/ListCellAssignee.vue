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
      <ListCellTrigger
        :label="label"
        :chevron="!!assignee"
        class="gap-1.5 max-w-full"
      >
        <UiPerson
          :person="assignee"
          empty-on-hover
        />
      </ListCellTrigger>
    </template>
  </AssigneeMenu>
</template>
