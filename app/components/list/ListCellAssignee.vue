<script setup lang="ts">
const props = defineProps<{
  assignee: { id: string, name: string, avatarUrl: string | null } | null
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
  readOnly?: boolean
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [assigneeId: string | null]
  'update:popoverOpen': [open: boolean]
}>()

const label = computed(() =>
  props.assignee ? `Assigned to ${props.assignee.name}. Change assignee` : 'Assign someone'
)
</script>

<template>
  <div
    v-if="readOnly"
    class="flex items-center min-h-[22px]"
  >
    <UiPerson :person="assignee" />
  </div>

  <UPopover
    v-else
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <!-- A button, not a div: as a div this popover trigger had no tabindex, so
         reassigning a card was impossible without a mouse. -->
    <button
      type="button"
      :aria-label="label"
      class="flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer min-h-[22px] max-w-full"
      @click.stop
    >
      <UiPerson :person="assignee" />
      <UIcon
        v-if="assignee"
        name="i-lucide-chevron-down"
        class="text-2xs shrink-0 text-dimmed opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </button>

    <template #content>
      <div class="py-1 min-w-[180px]">
        <button
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-sm transition-colors"
          :class="!assignee ? 'bg-primary/10 text-primary' : 'text-default hover:bg-elevated'"
          @click="emit('select', null)"
        >
          <UIcon
            name="i-lucide-user-x"
            class="text-sm text-dimmed shrink-0"
          />
          <span class="flex-1">Nobody</span>
          <UIcon
            v-if="!assignee"
            name="i-lucide-check"
            class="text-sm shrink-0 text-primary"
          />
        </button>
        <button
          v-for="m in members"
          :key="m.id"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-sm transition-colors"
          :class="assignee?.id === m.id ? 'bg-primary/10 text-primary' : 'text-default hover:bg-elevated'"
          @click="emit('select', m.id)"
        >
          <UAvatar
            :src="m.avatarUrl || undefined"
            :alt="m.name"
            size="3xs"
            class="shrink-0"
          />
          <span class="truncate flex-1">{{ m.name }}</span>
          <UIcon
            v-if="assignee?.id === m.id"
            name="i-lucide-check"
            class="text-sm shrink-0 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
