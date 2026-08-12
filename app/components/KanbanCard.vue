<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { BoardCard } from '~/types/card'

const props = defineProps<{
  card: BoardCard
}>()

const kanbanContext = inject<{
  projectKey: ComputedRef<string | undefined>
  projectSlug: ComputedRef<string | undefined>
  members: ComputedRef<Array<{ id: string, name: string, avatarUrl: string | null }> | undefined>
}>('kanbanContext')!

const emit = defineEmits<{
  click: []
  update: [cardId: number, updates: Record<string, unknown>]
}>()

const updatingField = ref<'priority' | 'assignee' | null>(null)

const detailUrl = computed(() => {
  if (!kanbanContext.projectSlug.value) return null
  return `/projects/${kanbanContext.projectSlug.value}/cards/${formatTicketId(kanbanContext.projectKey.value, props.card.id)}`
})

const assigneeInitials = computed(() => {
  if (!props.card.assignee) return 'N/A'
  const name = props.card.assignee.name || ''
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
  return name.charAt(0).toUpperCase() || '?'
})

function priorityMenuItems() {
  return [[
    ...PRIORITIES.slice().reverse().map(p => ({
      label: p.label,
      icon: p.icon,
      color: priorityUiColor(p.value),
      type: 'checkbox' as const,
      checked: props.card.priority === p.value,
      onSelect() {
        if (props.card.priority === p.value) return
        updatingField.value = 'priority'
        emit('update', props.card.id, { priority: p.value })
        nextTick(() => {
          updatingField.value = null
        })
      }
    }))
  ]]
}

function assigneeMenuItems(): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = [{
    label: 'Unassigned',
    icon: 'i-lucide-user-x',
    type: 'checkbox',
    checked: !props.card.assignee,
    onSelect() {
      if (!props.card.assignee) return
      updatingField.value = 'assignee'
      emit('update', props.card.id, { assigneeId: null })
      nextTick(() => {
        updatingField.value = null
      })
    }
  }]
  for (const m of (kanbanContext.members.value || [])) {
    items.push({
      label: m.name,
      icon: 'i-lucide-user',
      type: 'checkbox',
      checked: props.card.assignee?.id === m.id,
      onSelect() {
        if (props.card.assignee?.id === m.id) return
        updatingField.value = 'assignee'
        emit('update', props.card.id, { assigneeId: m.id })
        nextTick(() => {
          updatingField.value = null
        })
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
    class="kanban-card lift cursor-pointer rounded-lg bg-default border border-default p-3 group relative"
    @click="$emit('click')"
  >
    <!-- Expand to detail page -->
    <NuxtLink
      v-if="detailUrl"
      :to="detailUrl"
      class="absolute top-2 right-2 p-1 rounded-md text-dimmed hover:text-primary hover:bg-elevated opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all z-10"
      title="Open detail view"
      @click.stop
    >
      <UIcon
        name="i-lucide-expand"
        class="text-[14px]"
      />
    </NuxtLink>

    <!-- Ticket ID -->
    <TicketIdCopy
      class="mb-1"
      :project-key="kanbanContext.projectKey.value"
      :project-slug="kanbanContext.projectSlug.value"
      :card-id="card.id"
    />

    <!-- Title -->
    <p class="text-[14px] font-semibold leading-[1.4] text-highlighted tracking-[-0.01em] pr-6">
      {{ card.title }}
    </p>

    <!-- Description preview -->
    <p
      v-if="card.description"
      class="text-[12.5px] leading-relaxed text-muted mt-1.5 line-clamp-2"
    >
      {{ stripMarkdown(card.description) }}
    </p>

    <!-- Tags -->
    <div
      v-if="card.tags?.length"
      class="flex flex-wrap gap-1 mt-2"
    >
      <TagPill
        v-for="tag in card.tags"
        :key="tag.id"
        :name="tag.name"
        :color="tag.color"
      />
    </div>

    <!-- Footer row -->
    <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-muted">
      <div class="flex items-center gap-2.5 min-w-0">
        <!-- Priority dropdown (icon only) -->
        <UDropdownMenu
          :items="priorityMenuItems()"
          :content="{ align: 'start', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
        >
          <button
            type="button"
            class="flex items-center justify-center w-5 h-5 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 rounded-md"
            :class="[priorityTextClass(card.priority), card.priority === 'urgent' ? 'priority-urgent-pulse' : '']"
            :title="card.priority"
            @click.stop
          >
            <UIcon
              v-if="updatingField === 'priority'"
              name="i-lucide-loader-2"
              class="text-[16px] animate-spin"
            />
            <UIcon
              v-else
              :name="priorityIcon(card.priority)"
              class="text-[16px]"
            />
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
            class="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 rounded-md px-1 py-0.5 -mx-1 -my-0.5"
            :class="dueDateTextClass(getDueDateStatus(card.dueDate))"
            :title="formatDueDate(card.dueDate)"
            @click.stop
          >
            <UIcon
              :name="dueDateIcon(getDueDateStatus(card.dueDate))"
              class="text-[12px]"
            />
            <span class="select-none">{{ formatDueDate(card.dueDate) }}</span>
          </button>
        </DueDatePicker>

        <!-- Attachment count -->
        <span
          v-if="card.attachmentCount"
          class="flex items-center gap-0.5 text-dimmed whitespace-nowrap"
        >
          <UIcon
            name="i-lucide-paperclip"
            class="text-[12px]"
          />
          <span class="card-id select-none">{{ card.attachmentCount }}</span>
        </span>
      </div>

      <!-- Assignee dropdown -->
      <UDropdownMenu
        :items="assigneeMenuItems()"
        :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
      >
        <button
          type="button"
          class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-all hover:ring-2 hover:ring-primary/20 rounded-full px-1.5 py-0.5 shrink-0"
          :class="card.assignee
            ? 'bg-primary/10 text-primary'
            : 'bg-elevated text-dimmed'"
          @click.stop
        >
          <UIcon
            v-if="updatingField === 'assignee'"
            name="i-lucide-loader-2"
            class="text-[11px] animate-spin"
          />
          <template v-else>
            <UIcon
              name="i-lucide-user"
              class="text-[11px]"
            />
            <span>{{ assigneeInitials }}</span>
          </template>
        </button>
      </UDropdownMenu>
    </div>
  </div>
</template>
