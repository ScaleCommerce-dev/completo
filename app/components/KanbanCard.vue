<script setup lang="ts">
const props = defineProps<{
  card: {
    id: number
    title: string
    description?: string | null
    priority: string
    assignee: { id: string, name: string, avatarUrl: string | null } | null
    tags?: Array<{ id: string, name: string, color: string }>
    attachmentCount?: number
    dueDate?: string | null
  }
  projectKey?: string
  projectSlug?: string
  members?: Array<{ id: string, name: string, avatarUrl: string | null }>
}>()

const emit = defineEmits<{
  click: []
  update: [cardId: number, updates: Record<string, any>]
}>()

const updatingField = ref<'priority' | 'assignee' | null>(null)

const detailUrl = computed(() => {
  if (!props.projectSlug) return null
  return `/projects/${props.projectSlug}/cards/${formatTicketId(props.projectKey, props.card.id)}`
})

const assigneeInitials = computed(() => {
  if (!props.card.assignee) return 'N/A'
  const name = props.card.assignee.name || ''
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
  return name.charAt(0).toUpperCase() || '?'
})

const priorityColorMap: Record<string, 'error' | 'warning' | 'primary' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  medium: 'primary',
  low: 'neutral'
}

function priorityMenuItems() {
  return [[
    ...PRIORITIES.slice().reverse().map(p => ({
      label: p.label,
      icon: p.icon,
      color: priorityColorMap[p.value],
      type: 'checkbox' as const,
      checked: props.card.priority === p.value,
      onSelect() {
        if (props.card.priority === p.value) return
        updatingField.value = 'priority'
        emit('update', props.card.id, { priority: p.value })
        nextTick(() => { updatingField.value = null })
      }
    }))
  ]]
}

function assigneeMenuItems() {
  const items: any[] = [{
    label: 'Unassigned',
    icon: 'i-lucide-user-x',
    type: 'checkbox',
    checked: !props.card.assignee,
    onSelect() {
      if (!props.card.assignee) return
      updatingField.value = 'assignee'
      emit('update', props.card.id, { assigneeId: null })
      nextTick(() => { updatingField.value = null })
    }
  }]
  for (const m of (props.members || [])) {
    items.push({
      label: m.name,
      icon: 'i-lucide-user',
      type: 'checkbox',
      checked: props.card.assignee?.id === m.id,
      onSelect() {
        if (props.card.assignee?.id === m.id) return
        updatingField.value = 'assignee'
        emit('update', props.card.id, { assigneeId: m.id })
        nextTick(() => { updatingField.value = null })
      }
    })
  }
  return [items]
}

const dueDateOpen = ref(false)

const cardEl = ref<HTMLElement>()
</script>

<template>
  <div
    ref="cardEl"
    class="kanban-card cursor-pointer rounded-[10px] bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 p-3 group relative"
    @click="$emit('click')"
  >
    <!-- Expand to detail page -->
    <NuxtLink
      v-if="detailUrl"
      :to="detailUrl"
      class="absolute top-2 right-2 p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all z-10"
      title="Open detail view"
      @click.stop
    >
      <UIcon name="i-lucide-expand" class="text-[14px]" />
    </NuxtLink>

    <!-- Ticket ID -->
    <span class="card-id text-zinc-500 dark:text-zinc-400 select-none mb-1 block">
      {{ formatTicketId(projectKey, card.id) }}
    </span>

    <!-- Title -->
    <p class="text-[14px] font-semibold leading-[1.4] text-zinc-900 dark:text-zinc-100 tracking-[-0.01em] pr-6">
      {{ card.title }}
    </p>

    <!-- Description preview -->
    <p
      v-if="card.description"
      class="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2"
    >
      {{ stripMarkdown(card.description) }}
    </p>

    <!-- Tags -->
    <div v-if="card.tags?.length" class="flex flex-wrap gap-1 mt-2">
      <TagPill v-for="tag in card.tags" :key="tag.id" :name="tag.name" :color="tag.color" />
    </div>

    <!-- Footer row -->
    <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40">
      <div class="flex items-center gap-2.5 min-w-0">
        <!-- Priority dropdown (icon only) -->
        <UDropdownMenu :items="priorityMenuItems()" :content="{ align: 'start', side: 'bottom', sideOffset: 4, collisionPadding: 8 }">
          <button
            type="button"
            class="flex items-center justify-center w-5 h-5 cursor-pointer transition-all hover:ring-2 hover:ring-indigo-500/20 rounded-md"
            :class="card.priority === 'urgent' ? 'priority-urgent-pulse' : ''"
            :style="{ color: priorityColor(card.priority) }"
            :title="card.priority"
            @click.stop
          >
            <UIcon v-if="updatingField === 'priority'" name="i-lucide-loader-2" class="text-[16px] animate-spin" />
            <UIcon v-else :name="priorityIcon(card.priority)" class="text-[16px]" />
          </button>
        </UDropdownMenu>

        <!-- Due date popover -->
        <DueDatePicker
          v-if="card.dueDate"
          v-model:open="dueDateOpen"
          :model-value="card.dueDate"
          @update:model-value="val => emit('update', card.id, { dueDate: val })"
        >
          <button
            type="button"
            class="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-indigo-500/20 rounded-md px-1 py-0.5 -mx-1 -my-0.5"
            :style="{ color: dueDateColor(getDueDateStatus(card.dueDate)) }"
            :title="formatDueDate(card.dueDate)"
            @click.stop
          >
            <UIcon :name="dueDateIcon(getDueDateStatus(card.dueDate))" class="text-[12px]" />
            <span class="select-none">{{ formatDueDate(card.dueDate) }}</span>
          </button>
        </DueDatePicker>

        <!-- Attachment count -->
        <span
          v-if="card.attachmentCount"
          class="flex items-center gap-0.5 text-zinc-400 dark:text-zinc-500 whitespace-nowrap"
        >
          <UIcon name="i-lucide-paperclip" class="text-[12px]" />
          <span class="card-id select-none">{{ card.attachmentCount }}</span>
        </span>
      </div>

      <!-- Assignee dropdown -->
      <UDropdownMenu :items="assigneeMenuItems()" :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }">
        <button
          type="button"
          class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-all hover:ring-2 hover:ring-indigo-500/20 rounded-full px-1.5 py-0.5 shrink-0"
          :class="card.assignee
            ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'"
          @click.stop
        >
          <UIcon v-if="updatingField === 'assignee'" name="i-lucide-loader-2" class="text-[11px] animate-spin" />
          <template v-else>
            <UIcon name="i-lucide-user" class="text-[11px]" />
            <span>{{ assigneeInitials }}</span>
          </template>
        </button>
      </UDropdownMenu>
    </div>
  </div>
</template>
