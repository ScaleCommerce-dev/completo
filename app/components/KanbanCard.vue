<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { BoardCard } from '~/types/card'

/**
 * A card on the board.
 *
 * The previous layout spent about 100px on two lines of content: ticket ID on its
 * own line, an always-present footer separated by a rule, a priority icon that
 * rendered as six dots (`grip-horizontal`) and read unmistakably as a drag
 * handle, and an "N/A" pill on every unassigned card — six of eleven cards on the
 * demo board.
 *
 * Now:
 *  - Priority is a 2px left edge bar, which is what ListView already does, so the
 *    two views finally describe priority the same way. Only high and urgent draw
 *    one; an unremarkable card carries no marks.
 *  - Ticket ID and tags share one line, tags clamped to two plus a count.
 *  - The meta row renders only when it has something in it, so a two-line card is
 *    genuinely two lines.
 *  - Absent data is absent. No "N/A".
 */
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

const detailUrl = computed(() => {
  if (!kanbanContext.projectSlug.value) return null
  return `/projects/${kanbanContext.projectSlug.value}/cards/${formatTicketId(kanbanContext.projectKey.value, props.card.id)}`
})

const VISIBLE_TAGS = 2
const visibleTags = computed(() => (props.card.tags || []).slice(0, VISIBLE_TAGS))
const hiddenTagCount = computed(() => Math.max(0, (props.card.tags?.length || 0) - VISIBLE_TAGS))
const allTagNames = computed(() => (props.card.tags || []).map(t => t.name).join(', '))

const dueStatus = computed(() => getDueDateStatus(props.card.dueDate))

/** Whether the meta row has anything to show. Empty rows used to cost 28px. */
const hasMeta = computed(() =>
  !!props.card.dueDate || !!props.card.attachmentCount || !!props.card.assignee
)

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
        emit('update', props.card.id, { priority: p.value })
      }
    }))
  ]]
}

function assigneeMenuItems(): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = [{
    label: 'Nobody',
    icon: 'i-lucide-user-x',
    type: 'checkbox',
    checked: !props.card.assignee,
    onSelect() {
      if (!props.card.assignee) return
      emit('update', props.card.id, { assigneeId: null })
    }
  }]
  for (const m of (kanbanContext.members.value || [])) {
    items.push({
      label: m.name,
      avatar: { src: m.avatarUrl || undefined, alt: m.name },
      type: 'checkbox',
      checked: props.card.assignee?.id === m.id,
      onSelect() {
        if (props.card.assignee?.id === m.id) return
        emit('update', props.card.id, { assigneeId: m.id })
      }
    })
  }
  return [items]
}

const dueDateOpen = ref(false)
</script>

<template>
  <div
    class="kanban-card lift group relative cursor-pointer overflow-hidden rounded-lg bg-default border border-default shadow-raise hover:border-accented"
    @click="$emit('click')"
  >
    <!-- Priority edge bar. High and urgent only. -->
    <span
      v-if="priorityBarClass(card.priority)"
      class="absolute left-0 top-0 bottom-0 w-[2.5px]"
      :class="[priorityBarClass(card.priority), card.priority === 'urgent' ? 'priority-urgent-pulse' : '']"
      aria-hidden="true"
    />

    <div class="p-2.5 pl-3">
      <!-- Identity row: ticket ID, tags, and the open-detail affordance -->
      <div class="flex items-center gap-1.5 min-w-0">
        <TicketIdCopy
          :project-key="kanbanContext.projectKey.value"
          :project-slug="kanbanContext.projectSlug.value"
          :card-id="card.id"
        />

        <template v-if="visibleTags.length">
          <TagPill
            v-for="tag in visibleTags"
            :key="tag.id"
            :name="tag.name"
            :color="tag.color"
            class="shrink-0"
          />
          <UTooltip
            v-if="hiddenTagCount"
            :text="allTagNames"
          >
            <span class="text-2xs font-bold text-dimmed shrink-0">+{{ hiddenTagCount }}</span>
          </UTooltip>
        </template>

        <NuxtLink
          v-if="detailUrl"
          :to="detailUrl"
          class="ml-auto shrink-0 p-0.5 rounded-md text-dimmed hover:text-primary hover:bg-elevated opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 focus-visible:opacity-100 transition"
          :aria-label="`Open ${formatTicketId(kanbanContext.projectKey.value, card.id)} in full`"
          @click.stop
        >
          <UIcon
            name="i-lucide-maximize-2"
            class="text-xs"
          />
        </NuxtLink>
      </div>

      <!-- Title. Clamped: it used to wrap without limit. -->
      <p class="text-sm font-semibold leading-snug text-highlighted tracking-[-0.01em] mt-1 line-clamp-3">
        {{ card.title }}
      </p>

      <p
        v-if="card.description"
        class="text-xs leading-relaxed text-muted mt-1 line-clamp-2"
      >
        {{ stripMarkdown(card.description) }}
      </p>

      <!-- Meta row — rendered only when it carries something -->
      <div
        v-if="hasMeta"
        class="flex items-center gap-2 mt-2 min-w-0"
      >
        <DueDatePicker
          v-if="card.dueDate"
          v-model:open="dueDateOpen"
          :model-value="card.dueDate"
          @update:model-value="val => emit('update', card.id, { dueDate: val })"
        >
          <button
            type="button"
            class="flex items-center gap-1 whitespace-nowrap text-2xs font-semibold cursor-pointer rounded-md px-1 -mx-1 py-0.5 hover:bg-elevated transition-colors"
            :class="dueDateTextClass(dueStatus)"
            :aria-label="`Due ${formatDueDate(card.dueDate)}. Change due date`"
            @click.stop
          >
            <UIcon
              :name="dueDateIcon(dueStatus)"
              class="text-2xs"
            />
            <span class="select-none">{{ formatDueDate(card.dueDate) }}</span>
          </button>
        </DueDatePicker>

        <span
          v-if="card.attachmentCount"
          class="flex items-center gap-0.5 text-2xs text-dimmed whitespace-nowrap"
          :aria-label="`${card.attachmentCount} attachments`"
        >
          <UIcon
            name="i-lucide-paperclip"
            class="text-2xs"
          />
          <span class="card-id select-none">{{ card.attachmentCount }}</span>
        </span>

        <!-- Assignee: a real avatar, and absent when unassigned. It used to be an
             initials pill reading "N/A" on every unassigned card, and UAvatar was
             never given :src, so uploaded images never appeared. -->
        <UDropdownMenu
          v-if="card.assignee"
          :items="assigneeMenuItems()"
          :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
          class="ml-auto shrink-0"
        >
          <button
            type="button"
            class="flex rounded-full transition-shadow hover:ring-2 hover:ring-primary/30"
            :aria-label="`Assigned to ${card.assignee.name}. Change assignee`"
            @click.stop
          >
            <UAvatar
              :src="card.assignee.avatarUrl || undefined"
              :alt="card.assignee.name"
              size="2xs"
            />
          </button>
        </UDropdownMenu>
      </div>
    </div>

    <!-- Hover-only controls. Priority and assignee are always reachable from the
         card modal; surfacing them here keeps the resting card quiet. -->
    <div class="absolute right-2 bottom-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <UDropdownMenu
        :items="priorityMenuItems()"
        :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
      >
        <UButton
          :icon="priorityIcon(card.priority)"
          variant="ghost"
          color="neutral"
          size="xs"
          :class="priorityTextClass(card.priority)"
          :aria-label="`Priority: ${priorityLabel(card.priority)}. Change priority`"
          @click.stop
        />
      </UDropdownMenu>

      <UDropdownMenu
        v-if="!card.assignee"
        :items="assigneeMenuItems()"
        :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
      >
        <UButton
          icon="i-lucide-user-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="Assign someone"
          @click.stop
        />
      </UDropdownMenu>
    </div>
  </div>
</template>
