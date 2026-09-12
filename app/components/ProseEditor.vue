<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { PROSE_EXTENSIONS } from '~/utils/prose-extensions'

/**
 * The card's description, written the way it reads.
 *
 * Built on Nuxt UI's `UEditor` (Tiptap 3) with `content-type="markdown"`, so the
 * stored value is still Markdown — the CLI, the API and `ProseDescription` all keep
 * working, and nothing in the database changes shape. Tiptap's markdown package
 * parses with `marked`, the same library the renderer uses, which is why storing
 * Markdown rather than a JSON document is viable at all: the round trip is lossless
 * for everything this app writes (`prose-markdown.test.ts` is that measurement).
 *
 * Content styling comes from Nuxt UI's own editor theme, extended in `app.config.ts`
 * — *not* from Tailwind Typography. Dressing the editable element in `prose` as well
 * was tried and is a mistake worth recording: the theme already styles headings,
 * lists, code, quotes and images for ProseMirror's DOM, so adding `prose` put two
 * complete stylesheets on one element. Task lists came out with a bullet beside the
 * checkbox and the label on its own line, tables lost their borders, and clicking
 * into a cell could leave text apparently right-aligned. None of that is Tiptap
 * misbehaving; it is two rulesets disagreeing about the same tags.
 *
 * The consequence is that the editor is styled *like* `ProseDescription` rather than
 * *by* the same declarations. That is the trade: the editor's DOM is not the
 * renderer's DOM (`data-type=taskList`, `.ProseMirror-selectednode`, a placeholder
 * drawn with `::before`), so one stylesheet cannot serve both without one of them
 * being fought at every turn.
 */
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
   * to 'card'; a comment editor passes 'comment' so it doesn't offer card skills
   * that interpolate card placeholders.
   */
  aiScope?: AiSkillScope
}>(), {
  title: '',
  tags: () => [],
  priority: 'medium',
  cardId: null,
  minHeight: 120,
  placeholder: 'Describe the task...',
  aiScope: 'card'
})

const emit = defineEmits<{
  escape: []
}>()

const editorRef = useTemplateRef<{ editor: Editor }>('editorRef')
const editor = computed(() => editorRef.value?.editor)

/**
 * Opening a card must not make it dirty.
 *
 * `UEditor` turns every Tiptap `update` event into an `update:modelValue`, and Tiptap
 * emits that event for more than edits: `setEditable` emits one unconditionally, with
 * a fresh empty transaction, and it runs once just after the editor is created. What
 * comes back is the document re-serialised — *correct*, but not byte-identical to what
 * was stored, because bullets normalise, table cells pad to an even width and a soft
 * line break becomes a trailing-double-space hard break.
 *
 * Propagated, that means the model differs from the server's copy before anything has
 * been typed: Save lights up on an untouched card, and `useTextDraft` writes a draft on
 * open — so every card you merely *looked* at announces a recovered draft the next time
 * you open it. Both were reproduced in the browser before this guard existed.
 *
 * So the model is driven from Tiptap's own event instead of from `update:modelValue`,
 * because only the event carries what tells the two apart: a real edit always has
 * `transaction.docChanged`, and the bookkeeping emits never do. Timing cannot stand in
 * for it — the create-time emit arrives *after* mount and after the tick, which is what
 * an earlier version of this guard got wrong.
 *
 * The normalisation is not suppressed, only its escape into the model ahead of an edit.
 * The first real keystroke carries it out, since Markdown serialises whole.
 *
 * `onUpdate` cannot be reached as an `@update` listener, either: it is one of
 * `UEditor`'s own props and it hands its emitting handler to Tiptap *after* spreading
 * ours, so a template listener is silently discarded and never fires. Registering on
 * the editor's emitter sidesteps that.
 */
function onEditorUpdate({ transaction }: { transaction: { docChanged: boolean } }) {
  const current = editor.value
  if (!current || !transaction.docChanged) return

  description.value = current.getMarkdown()
  maybeOpenMention()
}

/**
 * A counter that ticks on every transaction, so the toolbar can be reactive.
 *
 * `useEditor` hands back a `shallowRef` whose *identity* never changes — a
 * ProseMirror transaction mutates the editor in place. Vue therefore sees nothing
 * when the caret moves, and anything derived from `editor.state` is computed once
 * and then frozen: `UEditorToolbar` asks its handlers `isActive`/`isDisabled` during
 * render, so bold stays unlit inside bold text and the link button stays disabled
 * over a selection. Reading this counter in `toolbarItems` gives the toolbar a new
 * array per transaction, which is what makes it re-render and ask again.
 */
const revision = ref(0)

function onEditorTransaction() {
  revision.value++
}

watch(editor, (instance, previous) => {
  previous?.off('update', onEditorUpdate)
  previous?.off('transaction', onEditorTransaction)
  instance?.on('update', onEditorUpdate)
  instance?.on('transaction', onEditorTransaction)
}, { immediate: true })

onBeforeUnmount(() => {
  editor.value?.off('update', onEditorUpdate)
  editor.value?.off('transaction', onEditorTransaction)
})

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * The suggestion streams into a buffer, never into the document.
 *
 * The obvious wiring — hand `useAiDescription` the model and watch the text appear
 * in place — costs more than it looks. `UEditor` reacts to `modelValue` by calling
 * `setContent()`, so every token would re-parse the whole document and rebuild it,
 * over Markdown that is half-written for most of the stream (`**bol`). And it
 * destroys the thing being replaced: the pre-AI text would live only in
 * `useAiDescription`'s in-memory `previousDescription`, while `useTextDraft` — which
 * watches the model — would have overwritten the saved draft with the suggestion
 * 400ms in. Reload at that point and the user's own prose is gone from both places,
 * with Discard gone too. In create mode there is no server copy to fall back to.
 *
 * Keeping the stream out of the model fixes both at once, and fixes them *here*
 * rather than in the callers. The planned alternative was a `paused` flag on
 * `useTextDraft` that the callers would set for the duration of a suggestion — a
 * gate spanning two components and a composable, which had to be released in
 * exactly the right place or it lost the kept text instead. `description` simply
 * not changing until Keep needs none of that: the draft on disk stays the pre-AI
 * text for the whole round-trip because nothing asked it to change.
 */
const aiBuffer = ref('')

const {
  isGenerating: aiGenerating,
  error: aiError,
  pendingReview: aiPendingReview,
  generate: aiGenerateFn,
  cancel: aiCancel,
  accept: aiAcceptFn,
  decline: aiDeclineFn
} = useAiDescription(aiBuffer)

/** The window in which the preview stands in for the editor. */
const aiActive = computed(() => aiGenerating.value || aiPendingReview.value)

const aiKeepBtn = useTemplateRef<{ $el?: HTMLElement }>('aiKeepBtn')

/**
 * Keep focus inside this editor across the whole AI round-trip.
 *
 * ⌘↵ is routed by focus (see `CommentList`), and the AI flow loses it twice: the
 * skill popover takes focus, then closes onto a trigger that has meanwhile been
 * swapped for the Stop button, so focus falls back to <body>. While a proposal is
 * under review the editor is behind the preview and cannot hold focus — the Keep
 * button can, and it lives inside this component's wrapper, so the shortcut still
 * resolves here rather than reaching the card modal and saving the card.
 */
watch(aiPendingReview, (pending) => {
  if (pending) nextTick(() => aiKeepBtn.value?.$el?.focus())
})

function focusEditor() {
  nextTick(() => editor.value?.commands.focus())
}

function aiGenerate(payload: { skillId?: string, userPrompt?: string }) {
  // Seeded from the document so "improve" has something to improve, and so Stop
  // and Discard restore the text rather than an empty buffer.
  aiBuffer.value = description.value
  aiGenerateFn({
    title: props.title,
    description: description.value,
    tags: props.tags,
    priority: props.priority,
    projectSlug: props.projectSlug!,
    scope: props.aiScope,
    cardId: props.cardId ?? undefined
  }, payload)
}

function aiAccept() {
  // The one place the suggestion reaches the document.
  description.value = aiBuffer.value
  aiAcceptFn()
  focusEditor()
}

function aiDecline() {
  aiDeclineFn()
  focusEditor()
}

// ─── Extensions ──────────────────────────────────────────────────────────────

/**
 * Tables are the one thing on the toolbar with no `UEditor` handler, because its
 * defaults stop where its bundled extensions do.
 */
const handlers = {
  table: {
    canExecute: (e: Editor) => e.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    execute: (e: Editor) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    isActive: (e: Editor) => e.isActive('table'),
    isDisabled: undefined
  }
}

// ─── Keyboard and paste ──────────────────────────────────────────────────────

const editorProps = {
  /**
   * Escape belongs to the innermost thing, and must never reach the dialog behind us.
   *
   * Letting it travel to `window` is how Reka's DismissableLayer used to close the
   * whole card modal on Escape — taking an unsaved description with it. The
   * `@escape` listeners did fire; they just didn't stop the event. Consuming it
   * unconditionally is the point: with a new draft there is nothing for Escape to
   * do, and doing nothing beats discarding the draft and vastly beats closing the
   * card.
   *
   * Everything else is returned unhandled on purpose — ⌘↵ in particular, which the
   * card surfaces route by containment and which would stop committing if this
   * swallowed it.
   */
  handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
    if (event.key !== 'Escape') return false

    event.preventDefault()
    event.stopPropagation()

    if (mentionOpen.value) {
      closeMention()
      return true
    }
    emit('escape')
    return true
  },

  /**
   * Ticking a checkbox must leave a caret behind.
   *
   * The task item renders a real `<input>`, and clicking it moves focus to the input
   * rather than into the editable text — so the box toggles but the editor has no
   * visible caret until the next keystroke drags focus back. Returning focus on the
   * next frame (after ProseMirror has finished its own click handling) restores the
   * selection the click implied.
   */
  handleClick: (_view: unknown, _pos: number, event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.tagName !== 'INPUT') return false

    requestAnimationFrame(() => editor.value?.commands.focus())
    return false
  },

  /**
   * Pasted Markdown arrives rendered, not as literal asterisks.
   *
   * Tiptap's markdown package ships no paste handling at all — typing `## ` becomes
   * a heading through StarterKit's input rules, but pasting `## Heading` does not.
   * Given where this text comes from (a terminal, a README, another card, an agent)
   * that is the more common of the two.
   *
   * Two cases are left to Tiptap. Clipboard HTML means the source was rich text and
   * already carries its structure — reparsing its plain-text flattening would lose
   * more than it gained. Inside a code block the point of pasting is that the
   * characters survive.
   *
   * A URL pasted over a selection is handled here rather than delegated. The Link
   * extension's own `linkOnPaste` was tried and replaces the selected words with the
   * address instead of wrapping them, which is the opposite of what pasting a link
   * onto a word is for.
   */
  handlePaste: (_view: unknown, event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain')
    if (!text) return false
    if (event.clipboardData?.getData('text/html')) return false

    const current = editor.value
    if (!current || current.isActive('codeBlock') || current.isActive('code')) return false
    if (!current.state.selection.empty && isBareUrl(text)) {
      event.preventDefault()
      current.chain().focus().setLink({ href: text.trim() }).run()
      return true
    }

    event.preventDefault()
    current.commands.insertContent(text, { contentType: 'markdown' })
    return true
  }
}

/** A clipboard payload that is nothing but a link, so it can wrap a selection. */
function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text.trim())
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

/**
 * `keys` is drawn with `UiKey`, not handed to `UTooltip`'s `kbds` prop — that one
 * renders `UKbd` directly, which spells ⌘ and ⌥ as characters neither of the app's
 * fonts contains. See `UiKey` for the measurement.
 *
 * The shortcuts themselves are Tiptap's own bindings rather than a second set
 * layered on top, so a tooltip cannot drift from what the key actually does.
 */
interface ToolbarItem {
  icon: string
  label: string
  keys?: string[]
  kind?: string
  mark?: string
  level?: number
  onClick?: (e: Event) => void
}

const toolbarItems = computed<ToolbarItem[][]>(() => (revision.value, [
  [
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', label: 'Heading 1', keys: ['meta', 'alt', '1'] },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', label: 'Heading 2', keys: ['meta', 'alt', '2'] },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', label: 'Heading 3', keys: ['meta', 'alt', '3'] }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', label: 'Bold', keys: ['meta', 'b'] },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', label: 'Italic', keys: ['meta', 'i'] },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', label: 'Inline code', keys: ['meta', 'e'] },
    { kind: 'codeBlock', icon: 'i-lucide-square-code', label: 'Code block' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', label: 'Bullet list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', label: 'Numbered list' },
    { kind: 'taskList', icon: 'i-lucide-list-todo', label: 'Task list' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', label: 'Quote' }
  ],
  [
    { kind: 'table', icon: 'i-lucide-table', label: 'Insert table' }
  ]
]))

/**
 * Row and column controls, on a bubble that appears only inside a table.
 *
 * They cannot live on the main toolbar: every one of them acts on the cell the caret
 * is in, so out of a table they would be seven permanently disabled buttons. A table
 * also has no other way to shrink — `Backspace` in an empty row deletes the text, not
 * the row — so without these an accidental extra row is unremovable from the editor.
 */
const tableToolbarItems = computed<ToolbarItem[][]>(() => [
  [
    { icon: 'i-lucide-between-vertical-start', label: 'Add row above', onClick: () => editor.value?.chain().focus().addRowBefore().run() },
    { icon: 'i-lucide-between-vertical-end', label: 'Add row below', onClick: () => editor.value?.chain().focus().addRowAfter().run() },
    { icon: 'i-lucide-between-horizontal-start', label: 'Add column before', onClick: () => editor.value?.chain().focus().addColumnBefore().run() },
    { icon: 'i-lucide-between-horizontal-end', label: 'Add column after', onClick: () => editor.value?.chain().focus().addColumnAfter().run() }
  ],
  [
    { icon: 'i-lucide-rows-3', label: 'Delete row', onClick: () => editor.value?.chain().focus().deleteRow().run() },
    { icon: 'i-lucide-columns-3', label: 'Delete column', onClick: () => editor.value?.chain().focus().deleteColumn().run() },
    { icon: 'i-lucide-trash-2', label: 'Delete table', onClick: () => editor.value?.chain().focus().deleteTable().run() }
  ]
])

/** The bubble follows the caret, so it only makes sense while the caret is in a cell. */
function inTable(): boolean {
  return !!editor.value?.isActive('table')
}

/** Same staleness, same fix — the bubble's own buttons are plain `onClick` items. */
const tableItems = computed(() => (revision.value, tableToolbarItems.value))

// ─── Links ───────────────────────────────────────────────────────────────────

/**
 * Links get a popover rather than `UEditor`'s own handler, which is a `window.prompt`.
 * The app has no other `prompt()` anywhere, and a prompt cannot show the address a
 * link already has — which is most of what you open this for.
 */
const linkOpen = ref(false)
const linkUrl = ref('')

const linkActive = computed(() => (revision.value, !!editor.value?.isActive('link')))

/** Nothing to link: no selection to wrap and no existing link to edit. */
const linkDisabled = computed(() => {
  void revision.value
  const current = editor.value
  if (!current) return true
  return current.state.selection.empty && !current.isActive('link')
})

function openLinkPopover() {
  linkUrl.value = (editor.value?.getAttributes('link').href as string | undefined) || ''
  linkOpen.value = true
}

function applyLink() {
  const href = linkUrl.value.trim()
  const current = editor.value
  if (!href || !current) return

  // `extendMarkRange` so editing an existing link rewrites the whole thing rather
  // than splitting it at the caret.
  current.chain().focus().extendMarkRange('link').setLink({ href }).run()
  linkOpen.value = false
}

function removeLink() {
  // `preventAutolink` so the text left behind is not immediately relinked by the
  // autolink rule that would otherwise see a bare URL and put the mark straight back.
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().setMeta('preventAutolink', true).run()
  linkUrl.value = ''
  linkOpen.value = false
}

// ─── Mentions ────────────────────────────────────────────────────────────────

const mentionOpen = ref(false)
/** Set when the picker was opened by typing `@`, so accepting can remove it. */
const mentionTypedTrigger = ref(false)

function openMention(fromTyping: boolean) {
  mentionTypedTrigger.value = fromTyping
  mentionOpen.value = true
}

function closeMention() {
  mentionOpen.value = false
  mentionTypedTrigger.value = false
  focusEditor()
}

/**
 * Shorten a user id to its first UUID group, so the stored Markdown stays readable
 * in a terminal. Resolution is scoped to one project's members, so 8 hex characters
 * is ample — but if another member we know about shares that prefix, store the full
 * id: the server refuses to resolve an ambiguous ref rather than guess, and a guess
 * would mean notifying the wrong person.
 */
function mentionRef(userId: string): string {
  const short = userId.slice(0, 8)
  const clash = (props.members || []).some(m => m.id !== userId && m.id.startsWith(short))
  return clash ? userId : short
}

function onMentionSelect(item: { _type: 'user', id: string, name: string } | { _type: 'card', id: number, title: string }) {
  const current = editor.value
  if (!current) return

  const chain = current.chain().focus()

  // The `@` that opened the picker is part of the mention, not text in front of it.
  if (mentionTypedTrigger.value) {
    const { from } = current.state.selection
    chain.deleteRange({ from: from - 1, to: from })
  }

  if (item._type === 'user') {
    chain.insertContent([
      { type: 'completoMention', attrs: { id: mentionRef(String(item.id)), label: item.name } },
      { type: 'text', text: ' ' }
    ])
  } else {
    const slug = `${props.projectKey}-${item.id}`
    chain.insertContent([
      {
        type: 'text',
        text: `${item.title} (${slug})`,
        marks: [{ type: 'link', attrs: { href: `/projects/${props.projectSlug}/cards/${slug}` } }]
      },
      { type: 'text', text: ' ' }
    ])
  }

  chain.run()
  mentionOpen.value = false
  mentionTypedTrigger.value = false
}

/**
 * `@` at a word boundary opens the picker, the same trigger the textarea had.
 *
 * Watched on the transaction rather than bound as a key, because an input rule would
 * fire inside code blocks and a keydown handler would fire before the character
 * exists. Cheap: it reads one character either side of the caret.
 */
function maybeOpenMention() {
  const current = editor.value
  if (!current || mentionOpen.value || aiActive.value) return
  if (current.isActive('codeBlock') || current.isActive('code')) return

  const { from, empty } = current.state.selection
  if (!empty || from < 1) return

  const before = current.state.doc.textBetween(Math.max(0, from - 2), from, '\n', '\n')
  if (!before.endsWith('@')) return
  if (before.length > 1 && !/\s/.test(before[0]!)) return

  openMention(true)
}

// ─── Images ──────────────────────────────────────────────────────────────────

const imagePickerOpen = ref(false)
const imageAttachments = ref<Array<{ id: string, originalName: string, mimeType?: string }>>([])
const imageUrlInput = ref('')

async function openImagePicker() {
  imagePickerOpen.value = true
  imageAttachments.value = []
  imageUrlInput.value = ''
  if (props.cardId) {
    try {
      const attachments = await $fetch<Array<{ id: string, originalName: string, mimeType?: string }>>(`/api/cards/${props.cardId}/attachments`)
      imageAttachments.value = attachments.filter(a => a.mimeType?.startsWith('image/'))
    } catch {
      // A card whose attachments cannot be listed still has the URL field below.
    }
  }
}

function closeImagePicker() {
  imagePickerOpen.value = false
  imageAttachments.value = []
  imageUrlInput.value = ''
}

function insertImage(alt: string, src: string) {
  editor.value?.chain().focus().setImage({ src, alt }).run()
  closeImagePicker()
}

function insertUrlImage() {
  const url = imageUrlInput.value.trim()
  if (url) insertImage('', url)
}

// ─── Host API ────────────────────────────────────────────────────────────────

defineExpose({
  /** Both callers focus the editor after opening it — see their `startEditingDescription`. */
  startEditing() {
    nextTick(() => editor.value?.commands.focus('start'))
  }
})
</script>

<template>
  <div
    class="relative rounded-lg border border-default transition-colors focus-within:border-primary"
    :class="mentionOpen ? 'overflow-visible' : 'overflow-hidden'"
    :style="{
      '--prose-editor-min': `${minHeight}px`,
      '--prose-editor-max': maxHeight != null ? `${maxHeight}px` : 'none'
    }"
  >
    <UEditor
      ref="editorRef"
      :model-value="description"
      content-type="markdown"
      :extensions="PROSE_EXTENSIONS"
      :handlers="handlers"
      :editor-props="editorProps"
      :placeholder="{ placeholder, mode: 'firstLine' }"
      :mention="false"
      :markdown="{ markedOptions: { gfm: true, breaks: true } }"
      :ui="{
        base: 'prose-editor-body px-4 sm:px-4 py-3 text-base text-toned',
        content: aiActive ? 'hidden' : undefined
      }"
    >
      <template #default="{ editor: instance }">
        <div class="flex flex-wrap items-center gap-y-1 gap-x-1 px-2 py-1.5 border-b border-default bg-muted">
          <UEditorToolbar
            :editor="instance"
            :items="toolbarItems"
            class="min-w-0 flex-1 flex-wrap"
          >
            <template #item="{ item, isActive, isDisabled, onClick }">
              <UTooltip :disabled="isDisabled(item)">
                <template #content="{ ui }">
                  <span :class="ui.text()">{{ item.label }}</span>
                  <span
                    v-if="item.keys"
                    :class="ui.kbds()"
                  >
                    <UiKey
                      v-for="key in item.keys"
                      :key="key"
                      :value="key"
                    />
                  </span>
                </template>
                <UButton
                  :icon="item.icon"
                  :active="isActive(item)"
                  :disabled="isDisabled(item)"
                  :aria-label="item.label"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @mousedown.prevent
                  @click="onClick($event, item)"
                />
              </UTooltip>
            </template>
          </UEditorToolbar>

          <!-- Controls that open a surface instead of running a command, so they
               anchor their own popover rather than living inside the toolbar. -->
          <div class="shrink-0 flex items-center gap-0.5">
            <UPopover
              v-model:open="linkOpen"
              :ui="{ content: 'w-80' }"
            >
              <UTooltip :text="linkActive ? 'Edit link' : 'Add link'">
                <UButton
                  icon="i-lucide-link"
                  :active="linkActive"
                  :disabled="linkDisabled"
                  :aria-label="linkActive ? 'Edit link' : 'Add link'"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @mousedown.prevent
                  @click="openLinkPopover"
                />
              </UTooltip>
              <template #content>
                <div class="p-2 flex items-center gap-1.5">
                  <input
                    v-model="linkUrl"
                    type="text"
                    aria-label="Link address"
                    placeholder="https://..."
                    class="flex-1 min-w-0 text-sm text-default placeholder:text-dimmed bg-muted border border-accented rounded-md px-2 py-1.5 transition-colors"
                    @keydown.enter.prevent="applyLink"
                    @keydown.escape.prevent="linkOpen = false"
                  >
                  <UButton
                    label="Apply"
                    size="xs"
                    class="shrink-0"
                    :disabled="!linkUrl.trim()"
                    @click="applyLink"
                  />
                  <UTooltip
                    v-if="linkActive"
                    text="Remove link"
                  >
                    <UButton
                      icon="i-lucide-unlink"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Remove link"
                      class="shrink-0"
                      @click="removeLink"
                    />
                  </UTooltip>
                </div>
              </template>
            </UPopover>

            <UPopover
              v-model:open="imagePickerOpen"
              :ui="{ content: 'w-72' }"
            >
              <UTooltip text="Insert image">
                <UButton
                  icon="i-lucide-image"
                  aria-label="Insert image"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @mousedown.prevent
                  @click="openImagePicker"
                />
              </UTooltip>
              <template #content>
                <div class="p-2">
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
                        @click="insertImage(att.originalName, `/api/attachments/${att.id}/download`)"
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

            <UTooltip text="Mention someone or link a card">
              <UButton
                icon="i-lucide-at-sign"
                aria-label="Mention someone or link a card"
                color="neutral"
                variant="ghost"
                size="sm"
                @mousedown.prevent
                @click="openMention(false)"
              />
            </UTooltip>
          </div>

          <!-- The AI's own controls, in the toolbar's vocabulary rather than beside it. -->
          <div class="shrink-0 flex items-center gap-1 pl-1">
            <template v-if="aiPendingReview">
              <UButton
                icon="i-lucide-undo-2"
                label="Discard"
                color="neutral"
                variant="ghost"
                size="sm"
                @mousedown.prevent
                @click="aiDecline"
              />
              <UButton
                ref="aiKeepBtn"
                icon="i-lucide-check"
                label="Keep"
                color="success"
                variant="soft"
                size="sm"
                @mousedown.prevent
                @click="aiAccept"
              />
            </template>
            <AiWriteButton
              v-else
              :title="title"
              :description="description"
              :tags="tags"
              :priority="priority"
              :is-generating="aiGenerating"
              :error="aiError"
              :scope="aiScope"
              @generate="aiGenerate"
              @cancel="aiCancel"
            />
          </div>
        </div>

        <!-- Row and column controls, only while the caret is in a cell. -->
        <UEditorToolbar
          :editor="instance"
          :items="tableItems"
          layout="bubble"
          :should-show="inTable"
          class="rounded-lg border border-default bg-default shadow-float p-1"
        >
          <template #item="{ item, onClick }">
            <UTooltip :text="item.label">
              <UButton
                :icon="item.icon"
                :aria-label="item.label"
                color="neutral"
                variant="ghost"
                size="sm"
                @mousedown.prevent
                @click="onClick($event, item)"
              />
            </UTooltip>
          </template>
        </UEditorToolbar>

        <!--
          The suggestion, while it is only a suggestion.

          It stands in for the editor rather than streaming into it — see `aiBuffer`.
          Rendered by `ProseDescription`, so what is being offered looks exactly like
          what would be saved, and this is also what retired the Write/Preview tabs:
          the only thing they were still doing was showing the AI's output.
        -->
        <div
          v-if="aiActive"
          class="prose-editor-body px-4 py-3"
        >
          <ProseDescription
            v-if="aiBuffer"
            :content="aiBuffer"
          />
          <div
            v-else-if="aiGenerating"
            class="flex items-center gap-2.5 text-sm text-dimmed"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="text-lg animate-spin text-primary"
            />
            <span>Generating<span class="loading-dots" /></span>
          </div>
        </div>
      </template>
    </UEditor>

    <!-- Anchored to the editor rather than to the caret: the picker is a search
         box with results, not a completion list, and it is reached from the
         toolbar as often as by typing `@`. -->
    <MentionPicker
      v-if="mentionOpen"
      class="absolute top-12 left-2 right-2 z-20"
      :members="members"
      :project-slug="projectSlug"
      :project-key="projectKey"
      @select="onMentionSelect"
      @close="closeMention"
    />
  </div>
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
