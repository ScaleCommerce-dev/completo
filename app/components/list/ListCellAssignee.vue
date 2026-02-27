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
  <!-- read-only -->
  <div
    v-if="readOnly"
    class="flex items-center gap-1.5 min-h-[22px]"
  >
    <template v-if="assignee">
      <UAvatar
        :alt="assignee.name"
        size="3xs"
      />
      <span class="text-zinc-500 dark:text-zinc-400 truncate text-[13.5px]">{{ assignee.name }}</span>
    </template>
    <span
      v-else
      class="text-zinc-300 dark:text-zinc-600 text-[13px]"
    >Unassigned</span>
  </div>

  <!-- editable -->
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <div
      class="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer min-h-[22px]"
      @click.stop
    >
      <template v-if="assignee">
        <UAvatar
          :alt="assignee.name"
          size="3xs"
        />
        <span class="text-zinc-500 dark:text-zinc-400 truncate text-[13.5px]">{{ assignee.name }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="text-[10px] shrink-0 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </template>
      <span
        v-else
        class="text-zinc-300 dark:text-zinc-600 text-[13px]"
      >Unassigned</span>
    </div>
    <template #content>
      <div class="list-popover-menu py-1 min-w-[160px]">
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
          :class="!assignee
            ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
          @click="emit('select', null)"
        >
          <UIcon
            name="i-lucide-user-x"
            class="text-[13px] text-zinc-400 shrink-0"
          />
          <span class="flex-1">Unassigned</span>
          <UIcon
            v-if="!assignee"
            name="i-lucide-check"
            class="text-[13px] shrink-0 text-indigo-500"
          />
        </button>
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
          :class="assignee?.id === m.id
            ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'"
          @click="emit('select', m.id)"
        >
          <UAvatar
            :alt="m.name"
            size="3xs"
          />
          <span class="truncate flex-1">{{ m.name }}</span>
          <UIcon
            v-if="assignee?.id === m.id"
            name="i-lucide-check"
            class="text-[13px] shrink-0 text-indigo-500"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
