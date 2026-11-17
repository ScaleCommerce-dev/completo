<script setup lang="ts">
import type { CardStatus, SubtaskProgress, SubtaskRow } from '~/types/card'

/**
 * A parent's sub-tasks, in the card panel and on the card's own page.
 *
 * The list is where hidden sub-tasks live: a board that does not show them as
 * cards still shows the parent's "2/5", and opening the parent is how you get to
 * them. Each row opens its sub-task.
 *
 * Adding is the board's quick add, not the card form: a title and Enter, and the
 * composer stays open for the next one, so breaking a card down is typing a
 * list. A new sub-task starts in the project's first status with nothing copied
 * from the parent — copying an "In Progress" would claim work has started.
 */
const props = defineProps<{
  cardId: number
  projectId: string
  subtasks: SubtaskRow[]
  /** The project's statuses, to name each sub-task's. */
  statuses: CardStatus[]
  doneStatusId?: string | null
  /**
   * The count in the heading, as the server makes it (`subtaskProgress`), the same
   * number the board shows on the card. It was recounted here from the rows,
   * a third copy of the rule.
   */
  progress?: SubtaskProgress | null
}>()

const emit = defineEmits<{
  created: []
  open: [cardId: number]
}>()

const statusOf = (id: string) => props.statuses.find(s => s.id === id)

const composing = ref(false)
const draft = ref('')
const saving = ref(false)
const draftInput = ref<HTMLTextAreaElement>()

function startComposing() {
  composing.value = true
  nextTick(() => draftInput.value?.focus())
}

function cancelComposing() {
  draft.value = ''
  composing.value = false
}

async function commitDraft(keepOpen = true) {
  const title = draft.value.trim()
  if (!title) {
    if (!keepOpen) composing.value = false
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/projects/${props.projectId}/cards`, {
      method: 'POST',
      // No status: the server starts it in the project's first status that is not Done.
      body: { title, parentId: props.cardId }
    })
    draft.value = ''
    emit('created')
    if (keepOpen) nextTick(() => draftInput.value?.focus())
    else composing.value = false
  } catch (e) {
    useToast().add({ title: 'Failed to add sub-task', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-1.5">
    <UiSectionLabel
      icon="i-lucide-list-tree"
      label="Sub-tasks"
      :count="progress?.total ? `${progress.done}/${progress.total}` : null"
    />

    <ul
      v-if="subtasks.length"
      class="flex flex-col"
    >
      <li
        v-for="sub in subtasks"
        :key="sub.id"
      >
        <button
          type="button"
          class="flex items-center gap-2 w-full min-w-0 rounded-md px-1.5 py-1 -mx-1.5 text-left text-sm transition-colors hover:bg-elevated"
          :aria-label="`Open ${sub.ticket}: ${sub.title}`"
          @click="emit('open', sub.id)"
        >
          <UiStatusDot
            :color="statusOf(sub.statusId)?.color"
            :done="sub.statusId === doneStatusId"
            size="sm"
          />
          <span class="card-id text-xs text-dimmed shrink-0">{{ sub.ticket }}</span>
          <span
            class="truncate"
            :class="sub.statusId === doneStatusId ? 'text-muted line-through' : 'text-default'"
          >{{ sub.title }}</span>
          <span class="ml-auto flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed">{{ statusOf(sub.statusId)?.name }}</span>
            <UiAvatar
              v-if="sub.assignee"
              :src="sub.assignee.avatarUrl ?? undefined"
              :alt="sub.assignee.name"
              :kind="sub.assignee.kind"
              :color="sub.assignee.color"
              size="3xs"
            />
          </span>
        </button>
      </li>
    </ul>

    <div
      v-if="composing"
      data-focus-field
      class="rounded-lg border border-default bg-default p-2"
    >
      <textarea
        ref="draftInput"
        v-model="draft"
        rows="1"
        aria-label="New sub-task title"
        placeholder="Sub-task title..."
        class="w-full resize-none bg-transparent text-sm leading-snug text-highlighted placeholder:text-dimmed border-0 p-0"
        :readonly="saving"
        @keydown.enter.exact.prevent="commitDraft(true)"
        @keydown.esc.stop.prevent="cancelComposing"
        @blur="commitDraft(false)"
      />
      <!-- `@mousedown.prevent`, as on the board's composer: the textarea commits
           on blur, so a press that moved focus would commit before the click. -->
      <UiCommitRow
        class="mt-1.5"
        submit-label="Add"
        shortcut="enter"
        :disabled="!draft.trim() || saving"
        @mousedown.prevent
        @submit="commitDraft(true)"
        @cancel="cancelComposing"
      />
    </div>

    <UButton
      v-else
      label="Add sub-task"
      icon="i-lucide-plus"
      variant="ghost"
      color="neutral"
      size="sm"
      class="self-start -mx-2.5 text-dimmed"
      @click="startComposing"
    />
  </section>
</template>
