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
}>(), {
  title: '',
  tags: () => [],
  priority: 'medium',
  cardId: null,
  minHeight: 120,
  maxHeight: 300
})

const emit = defineEmits<{
  escape: []
}>()

const editorRef = ref<{ editTab: 'write' | 'preview', textareaEl?: HTMLTextAreaElement, startEditing: () => void }>()

// ─── AI ───
const { isGenerating: aiGenerating, error: aiError, pendingReview: aiPendingReview, generate: aiGenerate, cancel: aiCancel, accept: aiAcceptFn, decline: aiDeclineFn } = useAiDescription(description)

watch(aiGenerating, (generating) => {
  if (generating && editorRef.value) {
    editorRef.value.editTab = 'preview'
  }
})

function aiAccept() {
  aiAcceptFn()
  if (editorRef.value) editorRef.value.editTab = 'write'
}

function aiDecline() {
  aiDeclineFn()
  if (editorRef.value) editorRef.value.editTab = 'write'
}

// ─── Mention ───
const mentionActive = ref(false)
const mentionAnchorPos = ref(-1)
const mentionCursorPos = ref(0)
const mentionSearchQuery = ref('')
const mentionSearchInput = ref<HTMLInputElement>()
const mentionIndex = ref(0)
const mentionUserResults = ref<Array<{ id: string, name: string, email?: string }>>([])
const mentionCardResults = ref<Array<{ id: number, title: string }>>([])

let mentionSearchTimeout: ReturnType<typeof setTimeout> | null = null

const mentionAllResults = computed(() => [
  ...mentionUserResults.value.map(u => ({ ...u, _type: 'user' as const })),
  ...mentionCardResults.value.map(c => ({ ...c, _type: 'card' as const }))
])

watch(mentionSearchQuery, (q) => {
  if (mentionSearchTimeout) clearTimeout(mentionSearchTimeout)
  const trimmed = q.trim()
  const members = props.members || []

  if (trimmed.length === 0) {
    mentionUserResults.value = members.slice(0, 5)
    mentionCardResults.value = []
    mentionIndex.value = 0
    return
  }

  if (trimmed.length === 1) {
    const lower = trimmed.toLowerCase()
    mentionUserResults.value = members
      .filter(m => m.name.toLowerCase().includes(lower) || m.email?.toLowerCase().includes(lower))
      .slice(0, 5)
    mentionCardResults.value = []
    mentionIndex.value = 0
    return
  }

  mentionSearchTimeout = setTimeout(async () => {
    const [users, cards] = await Promise.all([
      $fetch<Array<{ id: string, name: string, email?: string }>>('/api/users/search', { params: { q: trimmed } }).catch(() => [] as Array<{ id: string, name: string, email?: string }>),
      props.projectSlug
        ? $fetch<Array<{ id: number, title: string }>>(`/api/projects/${props.projectSlug}/cards/search`, { params: { q: trimmed } }).catch(() => [] as Array<{ id: number, title: string }>)
        : Promise.resolve([] as Array<{ id: number, title: string }>)
    ])
    mentionUserResults.value = users
    mentionCardResults.value = cards
    mentionIndex.value = 0
  }, 200)
})

function openMention(fromTyping = false) {
  const el = editorRef.value?.textareaEl
  if (!el) return
  if (fromTyping) {
    mentionAnchorPos.value = el.selectionStart
  } else {
    mentionAnchorPos.value = -1
    mentionCursorPos.value = el.selectionStart
  }
  mentionSearchQuery.value = ''
  mentionIndex.value = 0
  mentionUserResults.value = (props.members || []).slice(0, 5)
  mentionCardResults.value = []
  mentionActive.value = true
  nextTick(() => mentionSearchInput.value?.focus())
}

function closeMention() {
  if (mentionSearchTimeout) clearTimeout(mentionSearchTimeout)
  editorRef.value?.textareaEl?.focus()
  mentionActive.value = false
  mentionSearchQuery.value = ''
  mentionUserResults.value = []
  mentionCardResults.value = []
  mentionIndex.value = 0
}

function selectMention(item: { _type: 'user' | 'card', id: string | number, name?: string, title?: string }) {
  const el = editorRef.value?.textareaEl
  if (!el) return

  let mentionText: string
  if (item._type === 'user') {
    mentionText = `@[${item.name}] `
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
  if (mentionSearchTimeout) clearTimeout(mentionSearchTimeout)
  el.focus()
  mentionActive.value = false
  mentionSearchQuery.value = ''
  mentionUserResults.value = []
  mentionCardResults.value = []
  mentionIndex.value = 0
  nextTick(() => {
    el.setSelectionRange(newPos, newPos)
  })
}

function onMentionKeydown(e: KeyboardEvent) {
  const results = mentionAllResults.value
  if (e.key === 'Escape') {
    e.preventDefault()
    closeMention()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (results.length > 0) {
      mentionIndex.value = (mentionIndex.value + 1) % results.length
    }
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (results.length > 0) {
      mentionIndex.value = (mentionIndex.value - 1 + results.length) % results.length
    }
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const selected = results[mentionIndex.value]
    if (results.length > 0 && selected) {
      selectMention(selected)
    }
    return
  }
}

function onTextareaKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (mentionActive.value) {
      closeMention()
      return
    }
    emit('escape')
  }
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
    @textarea-keydown="onTextareaKeydown"
    @textarea-input="onTextareaInput"
  >
    <template #toolbar-append>
      <UPopover
        v-model:open="imagePickerActive"
        :ui="{ content: 'w-72' }"
      >
        <button
          type="button"
          title="Insert image"
          class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
          @mousedown.prevent
          @click="openImagePicker"
        >
          <UIcon
            name="i-lucide-image"
            class="text-[14px]"
          />
        </button>
        <template #content>
          <div class="p-2">
            <!-- Card Attachments -->
            <template v-if="imageAttachments.length > 0">
              <div class="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500">
                Card Attachments
              </div>
              <div class="grid grid-cols-3 gap-1.5 mb-2">
                <button
                  v-for="att in imageAttachments"
                  :key="att.id"
                  type="button"
                  class="aspect-square rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:ring-1 hover:ring-indigo-400/30 transition-all"
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
              <div class="border-t border-zinc-200/80 dark:border-zinc-700/50 mb-2" />
            </template>

            <!-- External URL -->
            <div class="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500">
              External URL
            </div>
            <div class="flex items-center gap-1.5">
              <input
                v-model="imageUrlInput"
                type="text"
                placeholder="https://..."
                class="flex-1 text-[13px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors"
                @keydown.enter.prevent="insertUrlImage"
                @keydown.escape.prevent="closeImagePicker"
              >
              <button
                type="button"
                class="shrink-0 px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!imageUrlInput.trim()"
                @click="insertUrlImage"
              >
                Insert
              </button>
            </div>
          </div>
        </template>
      </UPopover>
      <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <button
        type="button"
        title="Mention (@)"
        class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
        @mousedown.prevent
        @click="openMention(false)"
      >
        <UIcon
          name="i-lucide-at-sign"
          class="text-[14px]"
        />
      </button>
    </template>
    <template #toolbar-right>
      <div
        v-if="aiPendingReview"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          @click="aiDecline"
        >
          <UIcon
            name="i-lucide-undo-2"
            class="text-[13px]"
          />
          Discard
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
          @click="aiAccept"
        >
          <UIcon
            name="i-lucide-check"
            class="text-[13px]"
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
        @generate="(payload) => aiGenerate({ title, description, tags, priority, projectSlug: projectSlug! }, payload)"
        @cancel="aiCancel"
      />
    </template>
    <template #after-textarea>
      <div
        v-if="mentionActive"
        class="absolute top-1 left-2 right-2 z-20 rounded-lg border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden"
      >
        <div class="relative border-b border-zinc-200/80 dark:border-zinc-700/50">
          <UIcon
            name="i-lucide-search"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 dark:text-zinc-500"
          />
          <input
            ref="mentionSearchInput"
            v-model="mentionSearchQuery"
            placeholder="Search members or cards..."
            class="w-full pl-8 pr-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 bg-transparent border-0 outline-none"
            @keydown="onMentionKeydown"
          >
        </div>
        <div class="max-h-[240px] overflow-y-auto">
          <div v-if="mentionUserResults.length > 0">
            <div class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500">
              Members
            </div>
            <button
              v-for="(user, i) in mentionUserResults"
              :key="'u-' + user.id"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors"
              :class="i === mentionIndex
                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'"
              @mousedown.prevent
              @click="selectMention({ ...user, _type: 'user' })"
            >
              <UAvatar
                :alt="user.name"
                size="2xs"
              />
              <span class="font-medium truncate">{{ user.name }}</span>
              <span class="ml-auto text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{{ user.email }}</span>
            </button>
          </div>
          <div v-if="mentionCardResults.length > 0">
            <div class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500">
              Cards
            </div>
            <button
              v-for="(c, i) in mentionCardResults"
              :key="'c-' + c.id"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors"
              :class="(mentionUserResults.length + i) === mentionIndex
                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'"
              @mousedown.prevent
              @click="selectMention({ ...c, _type: 'card' })"
            >
              <span class="font-mono text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                {{ projectKey }}-{{ c.id }}
              </span>
              <span class="truncate">{{ c.title }}</span>
            </button>
          </div>
          <div
            v-if="mentionUserResults.length === 0 && mentionCardResults.length === 0 && mentionSearchQuery.trim().length >= 2"
            class="px-3 py-3 text-[12px] text-zinc-400 dark:text-zinc-500 italic text-center"
          >
            No matches found
          </div>
        </div>
      </div>
    </template>
  </MarkdownEditor>
</template>
