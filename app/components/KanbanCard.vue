<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { BoardCard } from '~/types/card'

/**
 * A card on the board.
 *
 * The card is a scanning object, not a detail view: a column of twenty is meant
 * to read as a list of *titles*. It previously read as a list of identifiers.
 * `TK-27` sat on line one in tracked monospace beside filled uppercase tag
 * pills, the title came second, and a stripped-markdown description came third —
 * so a card carrying a spec (TK-32) rendered as a paragraph and the first thing
 * the eye hit on every card was a number nobody was looking for.
 *
 * Now, top to bottom:
 *
 *  - **Title.** Loudest thing on the card, full width, up to three lines.
 *  - **Tags,** at most two plus a count, as a coloured dot and a name rather
 *    than a filled pill. See TagPill's `quiet` variant.
 *  - **A footer of signals.** The ticket ID whispers at the left — still a copy
 *    target, still readable across a desk, no longer the headline — with the
 *    decision signals pushed right.
 *
 * The description is gone from the face entirely; a single glyph in the footer
 * says one exists. Priority, assignee and the full-page link live in that same
 * footer row instead of a floating hover toolbar, which used to land on top of
 * the assignee avatar it shared a corner with. Medium and low priority stay
 * invisible until the card is hovered — the control is there, the ink is not.
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

/**
 * Hover-only controls share this, so they appear and disappear as one group.
 *
 * `max-sm:opacity-60` is not decoration: a touch device never fires `:hover`, so without
 * it priority, assign and the full-page link are invisible *and* unreachable on a phone.
 * They sit at 60% there instead — quiet, but present.
 */
const REVEAL = 'opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 focus-visible:opacity-100 transition-opacity'

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
      <!-- The object. Nothing above it. -->
      <p class="text-sm font-semibold leading-snug text-highlighted tracking-[-0.01em] line-clamp-3">
        {{ card.title }}
      </p>

      <!-- Tags, when there are any. A dot carries the colour; the name is text. -->
      <div
        v-if="visibleTags.length"
        class="flex items-center gap-2 mt-1.5 min-w-0"
      >
        <TagPill
          v-for="tag in visibleTags"
          :key="tag.id"
          :name="tag.name"
          :color="tag.color"
          variant="quiet"
          class="shrink-0 min-w-0"
        />
        <UTooltip
          v-if="hiddenTagCount"
          :text="allTagNames"
        >
          <span class="text-2xs font-medium text-dimmed shrink-0">+{{ hiddenTagCount }}</span>
        </UTooltip>
      </div>

      <!-- Footer. Identity on the left, decision signals on the right. -->
      <div class="flex items-center gap-1.5 mt-1.5 min-w-0">
        <TicketIdCopy
          :project-key="kanbanContext.projectKey.value"
          :project-slug="kanbanContext.projectSlug.value"
          :card-id="card.id"
          size="xs"
        />

        <!-- One glyph instead of two lines of stripped markdown. It says a spec
             exists; reading it is what opening the card is for. -->
        <UTooltip
          v-if="card.description"
          text="Has a description"
        >
          <UIcon
            name="i-lucide-align-left"
            class="text-2xs text-dimmed shrink-0"
          />
        </UTooltip>

        <span
          v-if="card.attachmentCount"
          class="flex items-center gap-0.5 text-2xs text-dimmed whitespace-nowrap shrink-0"
          :aria-label="`${card.attachmentCount} attachments`"
        >
          <UIcon
            name="i-lucide-paperclip"
            class="text-2xs"
          />
          <span class="card-id select-none">{{ card.attachmentCount }}</span>
        </span>

        <div class="ml-auto flex items-center gap-0.5 shrink-0">
          <!-- Priority. High and urgent are always lit; medium and low are a
               control without a colour, so they wait for hover. -->
          <UDropdownMenu
            :items="priorityMenuItems()"
            :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
          >
            <button
              type="button"
              class="flex items-center rounded-md p-0.5 hover:bg-elevated transition-colors"
              :class="[
                priorityTextClass(card.priority),
                isSignalPriority(card.priority)
                  ? (card.priority === 'urgent' ? 'priority-urgent-pulse' : '')
                  : REVEAL
              ]"
              :aria-label="`Priority: ${priorityLabel(card.priority)}. Change priority`"
              @click.stop
            >
              <UIcon
                :name="priorityIcon(card.priority)"
                class="text-xs"
              />
            </button>
          </UDropdownMenu>

          <DueDatePicker
            v-if="card.dueDate"
            v-model:open="dueDateOpen"
            :model-value="card.dueDate"
            @update:model-value="val => emit('update', card.id, { dueDate: val })"
          >
            <button
              type="button"
              class="flex items-center gap-1 whitespace-nowrap text-2xs font-semibold cursor-pointer rounded-md px-1 py-0.5 hover:bg-elevated transition-colors"
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

          <!-- Assignee: a real avatar, and absent when unassigned — the assign
               control takes its place on hover rather than an "N/A" pill. -->
          <UDropdownMenu
            :items="assigneeMenuItems()"
            :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
          >
            <button
              type="button"
              class="flex items-center rounded-full transition-shadow hover:ring-2 hover:ring-primary/30"
              :class="card.assignee ? '' : `rounded-md p-0.5 hover:ring-0 hover:bg-elevated text-dimmed ${REVEAL}`"
              :aria-label="card.assignee ? `Assigned to ${card.assignee.name}. Change assignee` : 'Assign someone'"
              @click.stop
            >
              <UAvatar
                v-if="card.assignee"
                :src="card.assignee.avatarUrl || undefined"
                :alt="card.assignee.name"
                size="2xs"
              />
              <UIcon
                v-else
                name="i-lucide-user-plus"
                class="text-xs"
              />
            </button>
          </UDropdownMenu>

          <NuxtLink
            v-if="detailUrl"
            :to="detailUrl"
            class="flex items-center rounded-md p-0.5 text-dimmed hover:text-primary hover:bg-elevated"
            :class="REVEAL"
            :aria-label="`Open ${formatTicketId(kanbanContext.projectKey.value, card.id)} in full`"
            @click.stop
          >
            <UIcon
              name="i-lucide-maximize-2"
              class="text-xs"
            />
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
