<script setup lang="ts">
const props = defineProps<{
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

const label = computed(() =>
  props.status ? `Status: ${props.status.name}. Change status` : 'Set a status'
)
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
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <button
      type="button"
      :aria-label="label"
      class="flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer max-w-full"
      @click.stop
    >
      <template v-if="status">
        <UiStatusDot
          :color="status.color"
          size="sm"
        />
        <span class="text-toned truncate text-sm">{{ status.name }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="text-2xs shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </template>
      <span
        v-else
        :class="EMPTY_CELL_CLASS"
      >&mdash;</span>
    </button>
    <template #content>
      <div class="py-1 min-w-[160px]">
        <button
          v-for="s in statuses"
          :key="s.id"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-sm transition-colors"
          :class="statusId === s.id ? 'bg-primary/10 text-primary' : 'text-default hover:bg-elevated'"
          @click="emit('select', s.id)"
        >
          <UiStatusDot
            :color="s.color"
            size="sm"
          />
          <span class="truncate flex-1">{{ s.name }}</span>
          <UIcon
            v-if="statusId === s.id"
            name="i-lucide-check"
            class="text-sm shrink-0 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
