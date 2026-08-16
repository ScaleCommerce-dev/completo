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

/**
 * The card panel navigates between cards without remounting this component, so
 * every piece of per-card editor state has to be torn down by hand.
 *
 * Clearing `draft` is the load-bearing line: `load()` only *assigns* when the
 * new card has a stored draft, so on a card with none it left the previous
 * card's text sitting in the composer — and `composerOpen` below then re-opened
 * it, under the new card's heading. Pressing Comment posted one card's text to
 * another. `useTextDraft` flushes the old card's scope before this reset lands,
 * so what is cleared here is the editor, never the draft.
 *
 * `editingId` before `editDraft`: the edit draft's scope is derived from both,
 * and nulling the id first drops the scope to null, so clearing the text cannot
 * file it under `card:<new>:comment:<old comment>`.
 */
watch(cardIdRef, () => {
  editingId.value = null
  editDraft.value = ''
  draft.value = ''
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
      class="mb-4"
    />

    <div
      v-if="loading && !comments.length"
      class="text-sm text-dimmed"
    >
      Loading…
    </div>

    <!--
      A ruled document, and the rules are *inset* — they begin where the prose
      begins and the faces hang outside them, in the margin.

      That distinction is the whole design, and it is what makes this the fourth
      answer rather than a return to the first. Recording all four, because three
      of them are tempting and one of them was shipped and looked at. Each verdict
      below is premised on *this* structure — an avatar gutter beside an inset
      content column — and binds only while that premise holds; a redesign that
      changes the structure re-opens them, and should rewrite this record rather
      than obey it:

      **`space-y-4` and nothing else.** 16px between comments and 2px between a name
      and the body under it. The gap ratio was not the problem — 8:1 is plenty — it
      was that a 13px semibold name and the 14px sentence under it *looked alike*,
      so four comments read as eight interchangeable lines.

      **Full-width hairlines between comments.** Wrong for one checkable reason: a
      rule spanning the whole row cuts straight across the avatar gutter, so the
      column the faces are supposed to own gets sliced at every comment and stops
      being a column. An inset rule does the opposite — it *defines* that column by
      starting at its edge, which is the move this had missed. (A layout with no
      gutter column has nothing for a full-width rule to cross; there this verdict
      says nothing.)

      **A vertical connector down the gutter**, GitHub's stub generalised. Its length
      is whatever the comment above happens to be tall, so between two one-liners it
      is a 20px tick and below one carrying a code block a 115px rail: a fragment
      rather than structure.

      **Avatars alone, no rules at all** — Linear's answer, and what shipped. It
      does not survive being looked at on a real card, and the reason is arithmetic:
      nine comments put nine 24px discs across ~500px of text, so the "column" is
      95% empty space, and everything else on the thread is left-aligned to one x.
      The eye gets a single ragged block of text with occasional bold 12px lines in
      it. Tinting the discs fixed *identity* and did nothing for *separation*, which
      is the thing that was actually missing.

      What settles it is not taste, though, it is that **a comment can contain a
      code block** — a slab with its own border, its own surface and its own corner
      radius. With no boundary on the comment, the most sharply defined thing on the
      thread was the inside of a comment rather than the comment, and a hierarchy
      that inverts is a hierarchy a reader has to fight. The mechanism is that the
      comment's boundary must outrank the code block's. A bare hairline can only do
      that by being *weaker* — a line competing with a line loses to the heavier one
      — hence one `border-default` and no card here. But a container that outranks
      the block by other means (a surface change, a header band, the block inset
      inside it) clears the same mechanism by a different route: "not a card" is
      this design's answer, not a ban on the device.

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
      class="space-y-4"
    >
      <!--
        No hover background. There was one — `hover:bg-muted/50`, which over white
        computes to `oklab(0.985 0 0 / 0.5)`: a 0.75% lightness delta, invisible in
        light mode and barely there in dark, so it read as a rendering fault to
        anyone who noticed it at all. It was also a lie about the row, which is the
        better reason to drop it than the contrast: nothing here is clickable, and a
        surface that lights up under the pointer and then does nothing is worse than
        one that never suggested it could — the rule the description's own prose
        follows. Its actual job was to tie the far-right action buttons to the
        comment they belong to, and the inset rule now does that by bounding the
        record all the way to the edge those buttons sit on.
      -->
      <li
        v-for="comment in comments"
        :key="comment.id"
        class="group flex gap-3"
      >
        <UiAvatar
          :src="comment.authorAvatarUrl"
          :alt="comment.authorName"
          :tint="!!comment.authorName"
          size="xs"
          class="shrink-0 mt-4 group-first:mt-0"
        />

        <!-- The rule lives on the *content* column, which is what makes it inset:
             the avatar is a sibling to the left of this box, so a `border-t` here
             starts at the prose's own left edge and never crosses the gutter. The
             16px above it comes from the list's `space-y-4` and the 16px below from
             this `pt-4`, so the hairline sits centred in a 32px band rather than
             hugging whichever comment happens to be adjacent. -->
        <div class="min-w-0 flex-1 border-t border-default pt-4 group-first:border-t-0 group-first:pt-0">
          <!-- The byline is deliberately *smaller* than what it introduces.
               13px semibold over 14px prose is barely a step, which is why a name
               and the sentence under it were indistinguishable and four comments
               read as eight loose lines. At 12px against 14px body text the eye
               takes the byline as a label and the comment as the content — which
               is the true hierarchy on a task card, where the avatar has already
               said who is speaking and what they said is the point.

               Name and time are then the *same* 12px, separated by weight and by
               `text-highlighted` against `text-dimmed`. They were 12 and 10, and
               two type sizes inside one 16px line put two baselines in it that
               never quite settled — the byline read as a fragment rather than as
               a line. One size, two weights is what `UiSectionLabel` and the
               rail's rows already do. -->
          <div class="relative flex items-center gap-2">
            <span class="text-xs font-semibold text-highlighted truncate">
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
              <span class="text-xs text-dimmed shrink-0">
                {{ relativeTime(comment.createdAt) }}
              </span>
            </UTooltip>
            <UTooltip
              v-if="wasEdited(comment)"
              :text="`Edited ${formatTimestamp(comment.updatedAt)}`"
            >
              <span class="text-xs text-dimmed shrink-0">· edited</span>
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
                 byline is its natural 16px and the body sits 2px under it.

                 Positioned against the *byline*, not the `<li>`. Against the li they
                 measured from its top edge, which is where the separator now is — so
                 on every comment but the first they floated in the 16px band above
                 the rule, straddling it and reading as belonging to neither record.
                 Centring on the byline row makes them immune to the padding that
                 band is made of. -->
            <div
              v-if="canDelete(comment) && editingId !== comment.id"
              class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity"
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
            <UiCommitRow
              class="mt-2"
              :loading="saving"
              :disabled="!editDraft.trim()"
              @submit="saveEdit(comment.id)"
              @cancel="cancelEdit"
            />
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
         hairline: it is the one row here that isn't a comment.

         40px, where two comments are 32 apart (16 + rule + 16). It was 24 against
         24 before the rules arrived and 32 against 32 immediately after them —
         adding the separator re-created the exact collision the 32 had been chosen
         to fix, because the interval it had to beat moved at the same time. The
         thing that must differ is the *gap*; the composer's own border can't do it,
         since a border is also what an empty section leads with and there this is
         the only row on screen. -->
    <div
      v-if="!readonly && cardId"
      :class="comments.length ? 'mt-10' : ''"
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
        <UiAvatar
          :src="currentUser?.avatarUrl"
          :alt="currentUser?.name ?? 'You'"
          size="xs"
          class="shrink-0"
        />
        <span class="text-sm text-dimmed">Leave a comment…</span>
      </button>

      <!-- Expanded, the composer joins the same avatar-column rhythm as the
           thread above it — it is, after all, the comment about to exist.
           Collapsed it can be a plain labelled row (there is nothing yet to
           attribute), but losing the avatar the moment you start typing was
           the one place the "avatars are the structure" rule broke down. -->
      <div
        v-else
        class="flex gap-3"
      >
        <UiAvatar
          :src="currentUser?.avatarUrl"
          :alt="currentUser?.name ?? 'You'"
          size="xs"
          class="shrink-0 mt-0.5"
        />
        <div class="min-w-0 flex-1">
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
          <UiCommitRow
            class="mt-2"
            submit-label="Comment"
            :loading="saving"
            :disabled="!draft.trim()"
            @submit="submit"
            @cancel="closeComposer"
          />
        </div>
      </div>
    </div>
  </div>
</template>
