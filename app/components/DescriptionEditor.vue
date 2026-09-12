<script setup lang="ts">
const description = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  title?: string
  tags?: string[]
  priority?: string
  projectSlug?: string
  projectKey?: string
  members?: Array<{ id: string, name: string, email?: string }>
  cardId?: number | null
  minHeight?: number
  maxHeight?: number
  /**
   * Ghost text in the empty editor. The default belongs to a card description,
   * and the comment boxes reuse this component — so a comment editor spent a
   * long time telling people to "Describe the task...".
   */
  placeholder?: string
  /**
   * Which AI skills this editor offers, and which AI endpoint it targets. Defaults
   * to 'card' so existing callers are unaffected; CommentList passes 'comment' so
   * the comment box doesn't offer card skills that interpolate card placeholders.
   */
  aiScope?: AiSkillScope
}>(), {
  title: '',
  tags: () => [],
  priority: 'medium',
  cardId: null,
  minHeight: 120,
  maxHeight: 300,
  placeholder: 'Describe the task...',
  aiScope: 'card'
})

const emit = defineEmits<{
  escape: []
}>()

const editorRef = ref<{ editTab: 'write' | 'preview', textareaEl?: HTMLTextAreaElement, startEditing: () => void, autoResize: () => void }>()
const aiKeepBtn = ref<HTMLButtonElement>()

// ─── AI ───
const { isGenerating: aiGenerating, error: aiError, pendingReview: aiPendingReview, generate: aiGenerate, cancel: aiCancel, accept: aiAcceptFn, decline: aiDeclineFn } = useAiDescription(description)

watch(aiGenerating, (generating) => {
  if (generating && editorRef.value) {
    editorRef.value.editTab = 'preview'
  }
})

/**
 * Keep focus inside this editor across the whole AI round-trip.
 *
 * Cmd+Enter is routed by focus (see CommentList), and the AI flow loses it twice:
 * the skill popover takes focus, then closes onto a trigger that has meanwhile been
 * swapped for the Stop button, so focus falls back to <body>; and clicking Keep
 * focuses a button that immediately unmounts. In a comment editor that means the next
 * Cmd+Enter reaches the card modal instead, which saves the card, closes it, and
 * takes the unposted comment with it.
 *
 * While a proposal is under review the textarea is behind the preview tab and can't
 * hold focus — the Keep button can, and it lives inside the same
 * `[data-comment-editor]` wrapper, so the shortcut still resolves to this editor.
 */
watch(aiPendingReview, (pending) => {
  if (pending) nextTick(() => aiKeepBtn.value?.focus())
})

function focusTextarea() {
  nextTick(() => editorRef.value?.textareaEl?.focus())
}

function aiAccept() {
  aiAcceptFn()
  if (editorRef.value) editorRef.value.editTab = 'write'
  focusTextarea()
}

function aiDecline() {
  aiDeclineFn()
  if (editorRef.value) editorRef.value.editTab = 'write'
  focusTextarea()
}

/**
 * An emptied editor has nothing left to review. Reachable by submitting straight from
 * the review state (Cmd+Enter posts the comment and clears the draft), which would
 * otherwise leave Keep/Discard hanging over an empty box — with Discard restoring the
 * pre-AI text of an already-posted comment — and strand the editor on the preview tab.
 */
watch(description, (value) => {
  if (aiPendingReview.value && !value.trim()) aiAccept()
})

// ─── Mention ───
/**
 * The picker itself is `MentionPicker` — search, debounce, keyboard nav and the
 * results list all live there, because `ProseEditor` needs the same box and a
 * second copy of it would drift. What stays here is the half that is specific to a
 * textarea: where the `@` was, and how to splice markdown around it.
 */
const mentionActive = ref(false)
const mentionAnchorPos = ref(-1)
const mentionCursorPos = ref(0)

function openMention(fromTyping = false) {
  const el = editorRef.value?.textareaEl
  if (!el) return
  if (fromTyping) {
    mentionAnchorPos.value = el.selectionStart
  } else {
    mentionAnchorPos.value = -1
    mentionCursorPos.value = el.selectionStart
  }
  mentionActive.value = true
}

function closeMention() {
  editorRef.value?.textareaEl?.focus()
  mentionActive.value = false
}

/**
 * Shorten a user id to its first UUID group for the stored mention, so the raw
 * markdown stays readable in the textarea. Resolution is scoped to one project's
 * members, so 8 hex chars is ample. If another member we know about shares that
 * prefix, store the full id instead — the server refuses to resolve an ambiguous
 * ref rather than guess, which would mean a missed notification.
 */
function mentionRef(userId: string): string {
  const short = userId.slice(0, 8)
  const clash = (props.members || []).some(m => m.id !== userId && m.id.startsWith(short))
  return clash ? userId : short
}

function selectMention(item: { _type: 'user' | 'card', id: string | number, name?: string, title?: string }) {
  const el = editorRef.value?.textareaEl
  if (!el) return

  let mentionText: string
  if (item._type === 'user') {
    // Carries a user-id reference so notifications resolve by identity, not display
    // name — display names aren't unique and used to notify the wrong person.
    mentionText = `@[${item.name}](${mentionRef(String(item.id))}) `
  } else {
    const slug = `${props.projectKey}-${item.id}`
    mentionText = `[${item.title} (${slug})](/projects/${props.projectSlug}/cards/${slug}) `
  }

  let before: string
  let after: string
  if (mentionAnchorPos.value >= 0) {
    before = description.value.slice(0, mentionAnchorPos.value - 1)
    after = description.value.slice(mentionAnchorPos.value)
  } else {
    before = description.value.slice(0, mentionCursorPos.value)
    after = description.value.slice(mentionCursorPos.value)
  }

  description.value = before + mentionText + after
  const newPos = before.length + mentionText.length
  el.focus()
  mentionActive.value = false
  nextTick(() => {
    el.setSelectionRange(newPos, newPos)
  })
}

/**
 * Escape belongs to the innermost thing, and must never reach the dialog behind us.
 *
 * This handler used to emit `escape` and let the event carry on to `window`, where
 * Reka's DismissableLayer closed the whole card modal — taking an unposted comment or
 * an unsaved description with it. The `@escape` listeners did fire; they just didn't
 * stop the event, so Esc cancelled a comment edit *and* closed the card.
 *
 * Consuming it unconditionally is the point: with a new-comment draft there is nothing
 * for Esc to do, and doing nothing is the correct outcome — better than discarding the
 * draft, and far better than closing the card. `preventDefault` alone would suffice
 * (DismissableLayer skips dismissal when the event was defaulted) but stopping
 * propagation as well keeps this working if that check ever changes.
 *
 * The AI skill popover and the image picker run their own Esc handling; neither is
 * affected, because when they're open focus sits inside them, not in the textarea.
 */
function onTextareaKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return

  e.preventDefault()
  e.stopPropagation()

  if (mentionActive.value) {
    closeMention()
    return
  }
  emit('escape')
}

// ─── Image Picker ───
const imagePickerActive = ref(false)
const imageAttachments = ref<Array<{ id: string, originalName: string, mimeType?: string }>>([])

const imageUrlInput = ref('')

async function openImagePicker() {
  imagePickerActive.value = true
  imageAttachments.value = []
  imageUrlInput.value = ''
  if (props.cardId) {
    try {
      const attachments = await $fetch<Array<{ id: string, originalName: string, mimeType?: string }>>(`/api/cards/${props.cardId}/attachments`)
      imageAttachments.value = attachments.filter(a => a.mimeType?.startsWith('image/'))
    } catch {
      // ignore fetch errors
    }
  }
}

function closeImagePicker() {
  imagePickerActive.value = false
  imageAttachments.value = []
  imageUrlInput.value = ''
}

function insertImage(alt: string, url: string) {
  const el = editorRef.value?.textareaEl
  if (!el) return
  const pos = el.selectionStart
  const before = description.value.slice(0, pos)
  const after = description.value.slice(pos)
  const markdown = `![${alt}](${url})`
  description.value = before + markdown + after
  const newPos = before.length + markdown.length
  closeImagePicker()
  el.focus()
  nextTick(() => {
    el.setSelectionRange(newPos, newPos)
  })
}

function selectAttachmentImage(att: { id: string, originalName: string }) {
  insertImage(att.originalName, `/api/attachments/${att.id}/download`)
}

function insertUrlImage() {
  const url = imageUrlInput.value.trim()
  if (!url) return
  insertImage('', url)
}

function onTextareaInput() {
  if (mentionActive.value) return
  const el = editorRef.value?.textareaEl
  if (!el) return
  const pos = el.selectionStart
  if (pos > 0 && description.value[pos - 1] === '@') {
    if (pos === 1 || /\s/.test(description.value[pos - 2]!)) {
      openMention(true)
    }
  }
}

defineExpose({
  startEditing() { editorRef.value?.startEditing() },
  get editTab(): 'write' | 'preview' { return editorRef.value?.editTab ?? 'write' },
  set editTab(val: 'write' | 'preview') { if (editorRef.value) editorRef.value.editTab = val }
})
</script>

<template>
  <MarkdownEditor
    ref="editorRef"
    v-model="description"
    :min-height="minHeight"
    :max-height="maxHeight"
    :placeholder="placeholder"
    :overlay-open="mentionActive"
    @textarea-keydown="onTextareaKeydown"
    @textarea-input="onTextareaInput"
  >
    <template #toolbar-append>
      <UPopover
        v-model:open="imagePickerActive"
        :ui="{ content: 'w-72' }"
      >
        <UTooltip text="Insert image">
          <button
            type="button"
            class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
            @mousedown.prevent
            @click="openImagePicker"
          >
            <UIcon
              name="i-lucide-image"
              class="text-base"
            />
          </button>
        </UTooltip>
        <template #content>
          <div class="p-2">
            <!-- Card Attachments -->
            <template v-if="imageAttachments.length > 0">
              <div class="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-label text-dimmed">
                Card Attachments
              </div>
              <div class="grid grid-cols-3 gap-1.5 mb-2">
                <button
                  v-for="att in imageAttachments"
                  :key="att.id"
                  type="button"
                  class="aspect-square rounded-md overflow-hidden border border-accented hover:border-primary hover:ring-1 hover:ring-primary/30 transition-colors"
                  :title="att.originalName"
                  @click="selectAttachmentImage(att)"
                >
                  <img
                    :src="`/api/attachments/${att.id}/download`"
                    :alt="att.originalName"
                    class="w-full h-full object-cover"
                  >
                </button>
              </div>
              <div class="border-t border-default mb-2" />
            </template>

            <!-- External URL -->
            <div class="px-1 pb-1.5 text-2xs font-semibold uppercase tracking-label text-dimmed">
              External URL
            </div>
            <div class="flex items-center gap-1.5">
              <input
                v-model="imageUrlInput"
                type="text"
                aria-label="Image URL"
                placeholder="https://..."
                class="flex-1 min-w-0 text-sm text-default placeholder:text-dimmed bg-muted border border-accented rounded-md px-2 py-1.5 transition-colors"
                @keydown.enter.prevent="insertUrlImage"
                @keydown.escape.prevent="closeImagePicker"
              >
              <UButton
                label="Insert"
                size="xs"
                class="shrink-0"
                :disabled="!imageUrlInput.trim()"
                @click="insertUrlImage"
              />
            </div>
          </div>
        </template>
      </UPopover>
      <div class="w-px h-4 bg-accented mx-1" />
      <UTooltip text="Mention @">
        <button
          type="button"
          class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
          @mousedown.prevent
          @click="openMention(false)"
        >
          <UIcon
            name="i-lucide-at-sign"
            class="text-base"
          />
        </button>
      </UTooltip>
    </template>
    <template #toolbar-right>
      <div
        v-if="aiPendingReview"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted hover:text-error hover:bg-error/10 transition-colors"
          @mousedown.prevent
          @click="aiDecline"
        >
          <UIcon
            name="i-lucide-undo-2"
            class="text-sm"
          />
          Discard
        </button>
        <button
          ref="aiKeepBtn"
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-success bg-success/10 ring-1 ring-success/30 hover:bg-success/20 transition-colors"
          @mousedown.prevent
          @click="aiAccept"
        >
          <UIcon
            name="i-lucide-check"
            class="text-sm"
          />
          Keep
        </button>
      </div>
      <AiWriteButton
        v-else
        :title="title"
        :description="description"
        :tags="tags"
        :priority="priority"
        :is-generating="aiGenerating"
        :error="aiError"
        :scope="aiScope"
        @generate="(payload) => aiGenerate({ title, description, tags, priority, projectSlug: projectSlug!, scope: aiScope, cardId: cardId ?? undefined }, payload)"
        @cancel="aiCancel"
      />
    </template>
    <template #preview-empty>
      <div
        v-if="aiGenerating"
        class="flex items-center gap-2.5 text-sm text-dimmed"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="text-lg animate-spin text-primary"
        />
        <span>Generating description<span class="loading-dots" /></span>
      </div>
      <p
        v-else
        class="text-base text-dimmed italic"
      >
        Nothing to preview
      </p>
    </template>
    <template #after-textarea>
      <MentionPicker
        v-if="mentionActive"
        class="absolute top-1 left-2 right-2 z-20"
        :members="members"
        :project-slug="projectSlug"
        :project-key="projectKey"
        @select="selectMention"
        @close="closeMention"
      />
    </template>
  </MarkdownEditor>
</template>

<style scoped>
.loading-dots::after {
  content: '';
  animation: dots 1.4s steps(4, end) infinite;
}

@keyframes dots {
  0% { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
}
</style>
