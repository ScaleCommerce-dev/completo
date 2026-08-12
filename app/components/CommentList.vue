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
}

function startEdit(comment: Comment) {
  cancelDelete()
  editingId.value = comment.id
  editDraft.value = comment.body
}

function cancelEdit() {
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
    <h3 class="text-[11px] font-semibold tracking-wide text-zinc-400 dark:text-zinc-500 uppercase mb-3">
      Comments
      <span
        v-if="comments.length"
        class="ml-1 text-zinc-300 dark:text-zinc-600"
      >{{ comments.length }}</span>
    </h3>

    <div
      v-if="loading && !comments.length"
      class="text-[13px] text-zinc-400 dark:text-zinc-500"
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
            <span class="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 truncate">
              <!-- authorId is nulled when a user is deleted, so the name can be missing -->
              {{ comment.authorName ?? 'Deleted user' }}
            </span>
            <span class="text-[11px] text-zinc-400 dark:text-zinc-500">
              {{ relativeTime(comment.createdAt) }}
            </span>
            <span
              v-if="wasEdited(comment)"
              class="text-[11px] text-zinc-400 dark:text-zinc-500"
            >· edited</span>

            <div
              v-if="canDelete(comment) && editingId !== comment.id"
              class="ml-auto flex items-center gap-0.5"
            >
              <template v-if="confirmDeleteId === comment.id">
                <span class="text-[11px] font-medium text-red-500">Delete?</span>
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
            <DescriptionEditor
              v-model="editDraft"
              :members="members"
              :project-slug="projectSlug"
              :project-key="projectKey"
              :card-id="cardId"
              :min-height="120"
              :max-height="300"
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
                <kbd class="ml-1 text-[10px] font-mono opacity-75 bg-white/15 px-1 py-0.5 rounded">⌘↵</kbd>
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
      class="text-[13px] text-zinc-400 dark:text-zinc-500 mb-4"
    >
      No comments yet.
    </p>

    <div
      v-if="!readonly && cardId"
      data-comment-editor="new"
    >
      <DescriptionEditor
        v-model="draft"
        :members="members"
        :project-slug="projectSlug"
        :project-key="projectKey"
        :card-id="cardId"
        :min-height="120"
        :max-height="300"
      />
      <div class="flex justify-end mt-2">
        <UButton
          size="xs"
          :loading="saving"
          :disabled="!draft.trim()"
          @click="submit"
        >
          Comment
          <kbd class="ml-1 text-[10px] font-mono opacity-75 bg-white/15 px-1 py-0.5 rounded">⌘↵</kbd>
        </UButton>
      </div>
    </div>
  </div>
</template>
