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
      <span
        class="block w-2 h-2 rounded-full shrink-0"
        :style="{
          backgroundColor: status.color || '#a1a1aa',
          boxShadow: `inset 0 0 0 1px ${(status.color || '#a1a1aa')}30`
        }"
      />
      <span class="text-zinc-600 dark:text-zinc-400 truncate text-[13.5px]">{{ status.name }}</span>
    </template>
    <span
      v-else
      class="text-zinc-300 dark:text-zinc-600 text-[13.5px]"
    >&mdash;</span>
  </div>

  <!-- editable -->
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <div
      class="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
      @click.stop
    >
      <template v-if="status">
        <span
          class="block w-2 h-2 rounded-full shrink-0"
          :style="{
            backgroundColor: status.color || '#a1a1aa',
            boxShadow: `inset 0 0 0 1px ${(status.color || '#a1a1aa')}30`
          }"
        />
        <span class="text-zinc-600 dark:text-zinc-400 truncate text-[13.5px]">{{ status.name }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </template>
      <span
        v-else
        class="text-zinc-300 dark:text-zinc-600 text-[13.5px]"
      >&mdash;</span>
    </div>
    <template #content>
      <div class="list-popover-menu py-1 min-w-[140px]">
        <button
          v-for="s in statuses"
          :key="s.id"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
          :class="statusId === s.id
            ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
          @click="emit('select', s.id)"
        >
          <span
            class="block w-2 h-2 rounded-full shrink-0"
            :style="{ backgroundColor: s.color || '#a1a1aa' }"
          />
          <span class="truncate flex-1">{{ s.name }}</span>
          <UIcon
            v-if="statusId === s.id"
            name="i-lucide-check"
            class="text-[13px] shrink-0 text-indigo-500"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
