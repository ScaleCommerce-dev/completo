<script setup lang="ts">
defineProps<{
  status: { id: string, name: string, color: string | null } | null
  statusId: string
  statuses: Array<{ id: string, name: string, color: string | null }>
  readOnly?: boolean
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [statusId: string]
  'update:popoverOpen': [open: boolean]
}>()
</script>

<template>
  <!-- read-only -->
  <div
    v-if="readOnly"
    class="flex items-center gap-1.5"
  >
    <template v-if="status">
      <UiStatusDot
        :color="status.color"
        size="sm"
      />
      <span class="text-toned truncate text-sm">{{ status.name }}</span>
    </template>
    <span
      v-else
      class="text-dimmed text-sm"
    >&mdash;</span>
  </div>

  <!-- editable -->
  <StatusMenu
    v-else
    :statuses="statuses"
    :status-id="statusId"
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', !!$event)"
    @select="emit('select', $event)"
  >
    <template #default="{ label }">
      <ListCellTrigger
        :label="label"
        :chevron="!!status"
        class="gap-1.5 max-w-full"
      >
        <template v-if="status">
          <UiStatusDot
            :color="status.color"
            size="sm"
          />
          <span class="text-toned truncate text-sm">{{ status.name }}</span>
        </template>
        <span
          v-else
          :class="EMPTY_CELL_CLASS"
        >&mdash;</span>
      </ListCellTrigger>
    </template>
  </StatusMenu>
</template>
