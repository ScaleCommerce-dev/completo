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

/**
 * The composer is a single row until you mean to write something.
 *
 * Expanded, it is roughly 215px of chrome — Write/Preview tabs, seven toolbar
 * buttons, an AI control and a 120px textarea — and it was mounted on every card
 * whether or not anyone was commenting. On a card with nothing on it that made
 * the largest thing on the panel an empty box, and it sat directly under an
 * equally large description editor wearing the identical chrome, so the only
 * thing distinguishing the two was a heading well above them both.
 *
 * Collapsed it also *is* the comments empty state, which is why "No comments yet"
 * could go: a row saying "Leave a comment…" reports the same fact and offers the
 * action, where the sentence only reported it.
 */
const composerOpen = ref(false)

function openComposer() {
  composerOpen.value = true
  nextTick(() => newCommentEditor.value?.startEditing())
}

function closeComposer() {
  draft.value = ''
  commentDraft.clear()
  composerOpen.value = false
}

/**
 * Escape collapses an empty composer and does nothing to one you have written
 * in. Turning Escape into "discard what I typed" is the shortcut CLAUDE.md rules
 * out — a keystroke away from the editor's own Cancel, with no confirmation and
 * no undo.
 */
function escapeComposer() {
  if (draft.value.trim()) return
  closeComposer()
}

const newCommentEditor = ref<{ startEditing: () => void }>()

watch(cardIdRef, () => {
  commentDraft.load()
  // Text that came back has to be visible, for the same reason a restored
  // description opens its editor: a draft you cannot see is a draft you will
  // overwrite.
  composerOpen.value = !!draft.value.trim()
}, { immediate: true })

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
  closeComposer()
}

function discardCommentDraft() {
  closeComposer()
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
    <!-- The label arrives with the first comment.
         The collapsed composer is already this section's empty state — that is why
         "No comments yet" could go — so a heading above it is a heading over a
         void, which is the thing the attachments section stopped doing in the same
         pass. What the label is *for* is the count, and there is nothing to count
         until somebody writes something.

         (The three card sections also sat at three different letter-spacings —
         0.48px, 0.84px and 0.30px — because two of them hand-rolled the style
         UiSectionLabel exists to hold, and this one had no icon while its
         neighbours did.) -->
    <UiSectionLabel
      v-if="comments.length"
      label="Comments"
      icon="i-lucide-message-square"
      :count="comments.length"
      class="mb-2"
    />

    <div
      v-if="loading && !comments.length"
      class="text-sm text-dimmed"
    >
      Loading…
    </div>

    <!--
      A timeline: one vertical hairline down the avatar gutter, and nothing else.

      Two wrong answers came first and both are worth recording, because the second
      is the more tempting one.

      **`space-y-4` and nothing else.** 16px between comments and 2px between a name
      and the body under it. The gap ratio was not really the problem — 8:1 is
      plenty — it was that *the two lines looked alike*: a 13px semibold name over
      14px body text, both starting at the same x. Four comments therefore read as
      eight interchangeable lines. That diagnosis is what the header change below
      fixes, and it is the half that was missing the first time round.

      **Then horizontal hairlines between comments.** Consistent with the app, and
      wrong: this app uses a divided stack for a *table of uniform fields* — the
      card page's rail, the attachments list — where every row is a label and a
      value. Comments are prose of wildly varying length, and banding prose reads as
      a spreadsheet. Worse, a full-width rule cuts straight across the avatar
      gutter, so the column the avatars are supposed to own gets sliced four times
      and stops meaning anything.

      **Then a vertical connector down the gutter**, GitHub's stub generalised. Also
      wrong, and for a reason worth writing down: its length is whatever the comment
      above it happens to be tall, so between two one-line comments it is a 20px
      tick and below one carrying a code block it is a 115px rail. It reads as a
      fragment rather than as structure. A connector earns its keep when the nodes
      it joins are cards of their own (GitHub) or uniform rows (an activity log);
      here it was decoration justifying a gutter that needs no justifying.

      What is left is what Linear does, and what should have been the answer first:
      **the avatars are the structure.** A column of them down the left edge marks
      where each comment starts, no line required — and 24px between comments
      against roughly 7px between a byline and its own body is the ratio that makes
      each pair read as one thing.

      **Author grouping was considered and rejected**, though it is what Slack and
      iMessage do and it would collapse the three consecutive "Demo Admin" headers
      on the demo card. Those three comments are 23 minutes and 3½ hours apart, so
      any window honest enough not to imply they were written together barely fires
      — and hiding a 3½-hour gap to save a repeated name trades information for
      tidiness. GitHub repeats the author on every comment for the same reason.
      Rejecting it is only defensible because the exact time now sits behind every
      relative one; see the tooltip below.
    -->
    <ul
      v-else-if="comments.length"
      class="space-y-6"
    >
      <li
        v-for="comment in comments"
        :key="comment.id"
        class="group relative flex gap-3"
      >
        <UAvatar
          :src="comment.authorAvatarUrl ?? undefined"
          :alt="comment.authorName ?? 'Unknown'"
          size="xs"
          class="shrink-0"
        />

        <div class="min-w-0 flex-1">
          <!-- The byline is deliberately *smaller* than what it introduces.
               13px semibold over 14px prose is barely a step, which is why a name
               and the sentence under it were indistinguishable and four comments
               read as eight loose lines. At 12px against 14px body text the eye
               takes the byline as a label and the comment as the content — which
               is the true hierarchy on a task card, where the avatar has already
               said who is speaking and what they said is the point. -->
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-default truncate">
              <!-- authorId is nulled when a user is deleted, so the name can be missing -->
              {{ comment.authorName ?? 'Deleted user' }}
            </span>
            <!-- The exact moment sits behind the relative one. "2d ago" is what
                 anyone wants to read, but it flattens genuinely different moments
                 into one label — the demo card's first three comments are 23
                 minutes and 3½ hours apart and every one of them renders as "2d
                 ago". Rejecting author-grouping (see the list comment) is only
                 honest if the real times are reachable. -->
            <UTooltip :text="formatTimestamp(comment.createdAt)">
              <span class="text-2xs text-dimmed shrink-0">
                {{ relativeTime(comment.createdAt) }}
              </span>
            </UTooltip>
            <UTooltip
              v-if="wasEdited(comment)"
              :text="`Edited ${formatTimestamp(comment.updatedAt)}`"
            >
              <span class="text-2xs text-dimmed shrink-0">· edited</span>
            </UTooltip>

            <!-- Quiet at rest, like the attachment row's. These used to be lit
                 on every comment, so a thread of five carried ten icons nobody
                 had asked for. `focus-within` keeps them reachable by keyboard,
                 and a pending delete confirmation stays visible regardless —
                 fading out the question you just asked is not a hover state.

                 Absolute, and that is not cosmetic: in the byline's flex row these
                 20px buttons set the row's height, so the byline was 20px tall
                 whether or not anything was in it and the comment's own text sat
                 24px below its author's name — the coupling this design depends on,
                 undone by a control that only appears on hover. Out of flow, the
                 byline is its natural 16px and the body sits 2px under it. -->
            <div
              v-if="canDelete(comment) && editingId !== comment.id"
              class="absolute right-0 top-0 flex items-center gap-0.5 transition-opacity"
              :class="confirmDeleteId === comment.id
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-60'"
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
                <UiKey value="meta" />
                <UiKey value="enter" />
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

          <!-- `mt-1`, not `mt-0.5`. The name and the body it belongs to were 2px
               apart while one comment and the next were 16px apart — an 8:1 ratio
               that is nowhere near enough to read as grouping, which is why the
               thread looked like eight loose lines rather than four comments. The
               dividers do most of that work now; this is the rest of it. -->
          <ProseDescription
            v-else
            :content="comment.body"
            class="mt-0.5"
          />
        </div>
      </li>
    </ul>

    <!-- Set apart from the records above it by space rather than by one more
         hairline: it is the one row here that isn't a comment. -->
    <div
      v-if="!readonly && cardId"
      :class="comments.length ? 'mt-6' : ''"
      data-comment-editor="new"
    >
      <!-- Collapsed: one row that reads as an input and doubles as the empty
           state for the whole section. -->
      <button
        v-if="!composerOpen"
        type="button"
        class="w-full flex items-center gap-2.5 rounded-lg border border-default bg-default px-3 py-2 text-left hover:bg-muted transition-colors"
        @click="openComposer"
      >
        <UAvatar
          :src="currentUser?.avatarUrl ?? undefined"
          :alt="currentUser?.name ?? 'You'"
          size="xs"
          class="shrink-0"
        />
        <span class="text-sm text-dimmed">Leave a comment…</span>
      </button>

      <template v-else>
        <UiDraftNotice
          v-if="commentDraft.restored.value"
          label="comment"
          class="mb-1.5"
          @discard="discardCommentDraft"
        />

        <DescriptionEditor
          ref="newCommentEditor"
          v-model="draft"
          :members="members"
          :project-slug="projectSlug"
          :project-key="projectKey"
          :card-id="cardId"
          :min-height="120"
          :max-height="300"
          placeholder="Leave a comment…"
          ai-scope="comment"
          @escape="escapeComposer"
        />
        <div class="flex items-center gap-2 mt-2">
          <UButton
            size="xs"
            :loading="saving"
            :disabled="!draft.trim()"
            @click="submit"
          >
            Comment
            <UiKey value="meta" />
            <UiKey value="enter" />
          </UButton>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="closeComposer"
          />
        </div>
      </template>
    </div>
  </div>
</template>
