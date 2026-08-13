<script setup lang="ts">
import type { Comment } from '~/composables/useComments'

const props = defineProps<{
  cardId: number | null | undefined
  members?: Array<{ id: string, name: string, email?: string }>
  projectSlug?: string
  projectKey?: string
  readonly?: boolean
  /**
   * Project owners and instance admins may delete another member's comment, so
   * inappropriate content can be removed without deleting the whole card. Editing
   * stays author-only regardless — see resolveComment.
   */
  canModerate?: boolean
}>()

const cardIdRef = computed(() => props.cardId ?? null)
const { comments, loading, saving, add, edit, remove } = useComments(cardIdRef)
const { user: currentUser } = useUserSession()

const draft = ref('')
const editingId = ref<string | null>(null)
const editDraft = ref('')

/**
 * Unposted comment text has nowhere to live but this component, and the component
 * unmounts whenever the card panel closes. Persisting it means a mis-click can no
 * longer cost a written comment — the text is waiting when the card reopens.
 *
 * Both editors, not just the new-comment box: it is precisely because *every*
 * editor's text now survives an unmount that the card panel can drop its
 * blocking "you have unsaved text" confirmation. Leave one editor unprotected
 * and that guard has to come back for it.
 */
const commentDraft = useTextDraft(
  () => (props.cardId ? `card:${props.cardId}:comment` : null),
  draft
)

const editingComment = computed(() => comments.value.find(c => c.id === editingId.value))

const commentEditDraft = useTextDraft(
  () => (props.cardId && editingId.value ? `card:${props.cardId}:comment:${editingId.value}` : null),
  editDraft,
  () => editingComment.value?.body || ''
)

watch(cardIdRef, () => commentDraft.load(), { immediate: true })

// Two-step inline confirm with a timeout, matching StatusManager — cards use a
// simple confirm rather than type-name-to-confirm (see CLAUDE.md).
const confirmDeleteId = ref<string | null>(null)
let confirmTimeout: ReturnType<typeof setTimeout> | null = null

function requestDelete(id: string) {
  if (confirmTimeout) clearTimeout(confirmTimeout)
  confirmDeleteId.value = id
  confirmTimeout = setTimeout(() => {
    confirmDeleteId.value = null
  }, 5000)
}

function cancelDelete() {
  if (confirmTimeout) clearTimeout(confirmTimeout)
  confirmDeleteId.value = null
}

onBeforeUnmount(() => {
  if (confirmTimeout) clearTimeout(confirmTimeout)
})

function isOwn(comment: Comment): boolean {
  return !!comment.authorId && comment.authorId === currentUser.value?.id
}

/** Only the author may edit; a moderator may delete but never rewrite. */
function canDelete(comment: Comment): boolean {
  return !props.readonly && (isOwn(comment) || !!props.canModerate)
}

function wasEdited(comment: Comment): boolean {
  return new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000
}

async function submit() {
  const body = draft.value.trim()
  if (!body) return
  await add(body)
  draft.value = ''
  commentDraft.clear()
}

function discardCommentDraft() {
  draft.value = ''
  commentDraft.clear()
}

function startEdit(comment: Comment) {
  cancelDelete()
  editingId.value = comment.id
  editDraft.value = comment.body
  // The scope follows `editingId`, so this reads the draft belonging to the
  // comment just opened rather than the one left behind.
  commentEditDraft.load()
}

function cancelEdit() {
  // Clear before dropping the id: the scope is derived from it, so releasing it
  // first would leave the draft keyed to a comment nothing can reach.
  commentEditDraft.clear()
  editingId.value = null
  editDraft.value = ''
}

async function saveEdit(id: string) {
  const body = editDraft.value.trim()
  if (!body) return
  await edit(id, body)
  cancelEdit()
}

async function confirmRemove(id: string) {
  cancelDelete()
  await remove(id)
}

/**
 * Cmd+Enter submits whichever editor the keystroke came from.
 *
 * The card page and CardModal each bind Cmd+Enter to saving the card, on a
 * document capture listener (a `@keydown` on the form doesn't work — portals break
 * it, see CLAUDE.md). Those handlers bail out when the event originates inside a
 * `[data-comment-editor]`, and this one claims it instead, so the shortcut follows
 * focus rather than always saving the card. Both check containment rather than
 * relying on listener order, so neither depends on which mounted first.
 */
function handleCmdEnter(e: KeyboardEvent) {
  if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return

  const scope = (e.target as HTMLElement | null)?.closest?.('[data-comment-editor]') as HTMLElement | null
  if (!scope) return

  e.preventDefault()
  e.stopImmediatePropagation()
  if (saving.value) return

  const which = scope.dataset.commentEditor
  if (which === 'new') submit()
  else if (which) saveEdit(which)
}

onMounted(() => document.addEventListener('keydown', handleCmdEnter, true))
onUnmounted(() => document.removeEventListener('keydown', handleCmdEnter, true))
</script>

<template>
  <div class="mt-6">
    <h3 class="text-xs font-semibold tracking-wide text-dimmed uppercase mb-3">
      Comments
      <span
        v-if="comments.length"
        class="ml-1 text-dimmed"
      >{{ comments.length }}</span>
    </h3>

    <div
      v-if="loading && !comments.length"
      class="text-sm text-dimmed"
    >
      Loading…
    </div>

    <ul
      v-else-if="comments.length"
      class="space-y-4 mb-4"
    >
      <li
        v-for="comment in comments"
        :key="comment.id"
        class="flex gap-2.5"
      >
        <UAvatar
          :src="comment.authorAvatarUrl ?? undefined"
          :alt="comment.authorName ?? 'Unknown'"
          size="xs"
          class="mt-0.5 shrink-0"
        />

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-default truncate">
              <!-- authorId is nulled when a user is deleted, so the name can be missing -->
              {{ comment.authorName ?? 'Deleted user' }}
            </span>
            <span class="text-xs text-dimmed">
              {{ relativeTime(comment.createdAt) }}
            </span>
            <span
              v-if="wasEdited(comment)"
              class="text-xs text-dimmed"
            >· edited</span>

            <div
              v-if="canDelete(comment) && editingId !== comment.id"
              class="ml-auto flex items-center gap-0.5"
            >
              <template v-if="confirmDeleteId === comment.id">
                <span class="text-xs font-medium text-error">Delete?</span>
                <UButton
                  icon="i-lucide-check"
                  variant="ghost"
                  color="error"
                  size="xs"
                  @click="confirmRemove(comment.id)"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="cancelDelete"
                />
              </template>
              <template v-else>
                <UTooltip
                  v-if="isOwn(comment)"
                  text="Edit"
                >
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="startEdit(comment)"
                  />
                </UTooltip>
                <UTooltip :text="isOwn(comment) ? 'Delete' : 'Delete as moderator'">
                  <UButton
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="requestDelete(comment.id)"
                  />
                </UTooltip>
              </template>
            </div>
          </div>

          <div
            v-if="editingId === comment.id"
            :data-comment-editor="comment.id"
            class="mt-1.5"
          >
            <UiDraftNotice
              v-if="commentEditDraft.restored.value"
              label="edit"
              class="mb-1.5"
              @discard="cancelEdit"
            />

            <DescriptionEditor
              v-model="editDraft"
              :members="members"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :card-id="cardId"
              :min-height="120"
              :max-height="300"
              ai-scope="comment"
              @escape="cancelEdit"
            />
            <div class="flex items-center gap-2 mt-2">
              <UButton
                size="xs"
                :loading="saving"
                :disabled="!editDraft.trim()"
                @click="saveEdit(comment.id)"
              >
                Save
                <kbd class="ml-1 text-2xs font-mono opacity-75 bg-white/15 px-1 py-0.5 rounded-md">⌘↵</kbd>
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                @click="cancelEdit"
              >
                Cancel
              </UButton>
            </div>
          </div>

          <ProseDescription
            v-else
            :content="comment.body"
            class="mt-0.5"
          />
        </div>
      </li>
    </ul>

    <p
      v-else
      class="text-sm text-dimmed mb-4"
    >
      No comments yet
    </p>

    <div
      v-if="!readonly && cardId"
      data-comment-editor="new"
    >
      <UiDraftNotice
        v-if="commentDraft.restored.value"
        label="comment"
        class="mb-1.5"
        @discard="discardCommentDraft"
      />

      <DescriptionEditor
        v-model="draft"
        :members="members"
        :project-slug="projectSlug"
        :project-key="projectKey"
        :card-id="cardId"
        :min-height="120"
        :max-height="300"
        ai-scope="comment"
      />
      <div class="flex justify-end mt-2">
        <UButton
          size="xs"
          :loading="saving"
          :disabled="!draft.trim()"
          @click="submit"
        >
          Comment
          <kbd class="ml-1 text-2xs font-mono opacity-75 bg-white/15 px-1 py-0.5 rounded-md">⌘↵</kbd>
        </UButton>
      </div>
    </div>
  </div>
</template>
