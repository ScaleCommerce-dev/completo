<script setup lang="ts">
/**
 * The issue's sub-issues and "Add sub-issues": a new issue in the same
 * project with this one as its parent, typed in place. The list keeps the
 * order the API returns (by id) by creation.
 */
const props = defineProps<{ card: TrackerIssueCard }>()

const emit = defineEmits<{ created: [] }>()

const index = inject(ISSUE_INDEX, null)
const assigneeOf = (id: number) => index?.value.get(id)?.assignee ?? null

const { issueTemplate } = useWorkspaceSettings()

const adding = ref(false)
const newTitle = ref('')
const saving = ref(false)
const input = ref<HTMLInputElement>()

/**
 * A new sub-issue starts in the project's first status, the way a card created
 * anywhere else in the app does.
 */
const firstStatusId = computed(() => [...props.card.statuses].sort((a, b) => a.position - b.position)[0]?.id)

function startAdding() {
  adding.value = true
  nextTick(() => input.value?.focus())
}

function stopAdding() {
  adding.value = false
  newTitle.value = ''
}

async function create() {
  const title = newTitle.value.trim()
  if (!title || !firstStatusId.value || saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/projects/${props.card.projectId}/cards`, {
      method: 'POST',
      // Title-only here, but the issue still starts with the template.
      body: { statusId: firstStatusId.value, title, parentId: props.card.id, description: issueTemplate.value || undefined }
    })
    newTitle.value = ''
    emit('created')
  } catch (e: unknown) {
    useToast().add({ title: 'Failed to add sub-issue', description: getErrorMessage(e, 'Something went wrong'), color: 'error' })
  } finally {
    saving.value = false
    // `readonly`, not `disabled`, while saving: a disabled input loses focus,
    // and the next title would need a click first.
    input.value?.focus()
  }
}
</script>

<template>
  <section>
    <div
      v-if="card.children.length"
      class="flex items-center gap-2 mb-1"
    >
      <h3 class="text-sm font-medium text-muted">
        Sub-issues
      </h3>
      <TrackerIssueProgress :progress="card.childProgress" />
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        class="ml-auto"
        aria-label="Add sub-issue"
        @click="startAdding"
      />
    </div>

    <ul
      v-if="card.children.length"
      class="border-y border-default divide-y divide-default"
    >
      <li
        v-for="child in card.children"
        :key="child.id"
        class="flex items-center gap-2 h-9 px-1 text-sm hover:bg-elevated transition-colors"
      >
        <TrackerIssueRefLink
          :issue="child"
          class="flex-1"
        />
        <UiAvatar
          v-if="assigneeOf(child.id)"
          :src="assigneeOf(child.id)!.avatarUrl"
          :alt="assigneeOf(child.id)!.name"
          :kind="assigneeOf(child.id)!.kind"
          :color="assigneeOf(child.id)!.color"
          size="3xs"
        />
      </li>
    </ul>

    <!-- A field you type a title into, with Enter to create and Escape to stop;
         it stays open after Enter so several sub-issues go in one after another.
         The row is the composite field, so it carries the focus line. -->
    <div
      v-if="adding"
      data-focus-field
      class="flex items-center gap-2 h-9 px-1 border-b border-default"
    >
      <TrackerStatusIcon
        category="backlog"
        :color="null"
      />
      <input
        ref="input"
        v-model="newTitle"
        type="text"
        placeholder="Sub-issue title"
        aria-label="Sub-issue title"
        class="flex-1 min-w-0 bg-transparent text-sm text-highlighted placeholder:text-dimmed"
        :readonly="saving"
        @keydown.enter.prevent="create"
        @keydown.esc.prevent="stopAdding"
        @blur="!newTitle.trim() && stopAdding()"
      >
    </div>

    <UButton
      v-if="!card.children.length && !adding"
      icon="i-lucide-plus"
      label="Add sub-issues"
      size="sm"
      variant="ghost"
      color="neutral"
      class="-ml-2.5 text-muted"
      @click="startAdding"
    />
  </section>
</template>
