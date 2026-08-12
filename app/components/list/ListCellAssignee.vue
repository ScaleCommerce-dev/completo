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
      <span class="text-muted truncate text-[13.5px]">{{ assignee.name }}</span>
    </template>
    <span
      v-else
      class="text-dimmed text-[13px]"
    >Unassigned</span>
  </div>

  <!-- editable -->
  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <div
      class="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer min-h-[22px]"
      @click.stop
    >
      <template v-if="assignee">
        <UAvatar
          :alt="assignee.name"
          size="3xs"
        />
        <span class="text-muted truncate text-[13.5px]">{{ assignee.name }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="text-[10px] shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
        />
      </template>
      <span
        v-else
        class="text-dimmed text-[13px]"
      >Unassigned</span>
    </div>
    <template #content>
      <div class="list-popover-menu py-1 min-w-[160px]">
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
          :class="!assignee
            ? 'bg-primary/10 text-primary'
            : 'text-default hover:bg-muted'"
          @click="emit('select', null)"
        >
          <UIcon
            name="i-lucide-user-x"
            class="text-[13px] text-dimmed shrink-0"
          />
          <span class="flex-1">Unassigned</span>
          <UIcon
            v-if="!assignee"
            name="i-lucide-check"
            class="text-[13px] shrink-0 text-primary"
          />
        </button>
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12px] transition-colors"
          :class="assignee?.id === m.id
            ? 'bg-primary/10 text-primary'
            : 'text-default hover:bg-muted'"
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
            class="text-[13px] shrink-0 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
