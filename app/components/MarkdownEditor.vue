<script setup lang="ts">
const props = withDefaults(defineProps<{
  placeholder?: string
  minHeight?: number
  maxHeight?: number | null
  /**
   * Set while an `after-textarea` overlay (e.g. the mention picker) is open.
   *
   * The root clips to its rounded-md corners with `overflow-hidden`, which also clips
   * that overlay to the editor's height. A short editor — a comment box at
   * minHeight 80 — left the results list invisible. Release the clip while the
   * overlay is open so it can extend past the editor, and restore it after, since
   * it's what keeps the toolbar and textarea inside the rounded-md border.
   */
  overlayOpen?: boolean
}>(), {
  placeholder: 'Describe the task...',
  minHeight: 120,
  maxHeight: null,
  overlayOpen: false
})

const modelValue = defineModel<string>({ default: '' })

const emit = defineEmits<{
  'textarea-keydown': [event: KeyboardEvent]
  'textarea-input': [event: Event]
}>()

const editTab = ref<'write' | 'preview'>('write')
const textareaEl = ref<HTMLTextAreaElement>()

function insertMarkdown(type: 'bold' | 'italic' | 'code' | 'codeblock' | 'quote') {
  const el = textareaEl.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = modelValue.value.slice(start, end)
  const before = modelValue.value.slice(0, start)
  const after = modelValue.value.slice(end)

  let insert: string
  let cursorOffset: number

  if (selected) {
    switch (type) {
      case 'bold': insert = `**${selected}**`
        break
      case 'italic': insert = `*${selected}*`
        break
      case 'code': insert = `\`${selected}\``
        break
      case 'codeblock': insert = `\n\`\`\`\n${selected}\n\`\`\`\n`
        break
      case 'quote': insert = selected.split('\n').map(l => `> ${l}`).join('\n')
        break
    }
    modelValue.value = before + insert + after
    cursorOffset = start + insert.length
  } else {
    switch (type) {
      case 'bold':
        modelValue.value = before + '****' + after
        cursorOffset = start + 2
        break
      case 'italic':
        modelValue.value = before + '**' + after
        cursorOffset = start + 1
        break
      case 'code':
        modelValue.value = before + '``' + after
        cursorOffset = start + 1
        break
      case 'codeblock':
        modelValue.value = before + '\n```\n\n```\n' + after
        cursorOffset = start + 5
        break
      case 'quote':
        modelValue.value = before + '> ' + after
        cursorOffset = start + 2
        break
      default:
        return
    }
  }

  nextTick(() => {
    el.focus()
    el.setSelectionRange(cursorOffset, cursorOffset)
  })
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  const computed = props.maxHeight != null
    ? Math.max(props.minHeight, Math.min(el.scrollHeight, props.maxHeight))
    : Math.max(props.minHeight, el.scrollHeight)
  el.style.height = computed + 'px'
}

// Auto-resize textarea when switching to write tab (e.g. after AI generation fills content while on preview)
watch(editTab, (tab) => {
  if (tab === 'write') {
    nextTick(() => autoResize())
  }
})

function startEditing() {
  editTab.value = 'write'
  nextTick(() => {
    autoResize()
    const el = textareaEl.value
    if (!el) return
    el.setSelectionRange(0, 0)
    el.focus()
    el.scrollTop = 0
  })
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey)) {
    if (e.key === 'b') {
      e.preventDefault()
      insertMarkdown('bold')
      return
    }
    if (e.key === 'i') {
      e.preventDefault()
      insertMarkdown('italic')
      return
    }
    if (e.key === 'e') {
      e.preventDefault()
      insertMarkdown('code')
      return
    }
  }
  emit('textarea-keydown', e)
}

defineExpose({ textareaEl, insertMarkdown, editTab, startEditing, autoResize })
</script>

<template>
  <div
    class="rounded-lg border border-default"
    :class="overlayOpen ? 'overflow-visible' : 'overflow-hidden'"
  >
    <!-- Tabs -->
    <div class="flex items-center border-b border-default bg-muted">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px"
        :class="editTab === 'write'
          ? 'text-default border-primary'
          : 'text-dimmed border-transparent hover:text-toned'"
        @click="editTab = 'write'"
      >
        <UIcon
          name="i-lucide-pencil"
          class="text-xs"
        />
        Write
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px"
        :class="editTab === 'preview'
          ? 'text-default border-primary'
          : 'text-dimmed border-transparent hover:text-toned'"
        @click="editTab = 'preview'"
      >
        <UIcon
          name="i-lucide-eye"
          class="text-xs"
        />
        Preview
      </button>
      <template v-if="$slots['toolbar-right']">
        <div class="ml-auto flex items-center pr-3">
          <slot name="toolbar-right" />
        </div>
      </template>
    </div>

    <!-- Toolbar (write tab only) -->
    <div
      v-show="editTab === 'write'"
      class="flex items-center gap-0.5 px-3 py-1.5 border-b border-default bg-muted bg-elevated"
    >
      <button
        type="button"
        title="Bold (⌘B)"
        class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
        @mousedown.prevent
        @click="insertMarkdown('bold')"
      >
        <UIcon
          name="i-lucide-bold"
          class="text-base"
        />
      </button>
      <button
        type="button"
        title="Italic (⌘I)"
        class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
        @mousedown.prevent
        @click="insertMarkdown('italic')"
      >
        <UIcon
          name="i-lucide-italic"
          class="text-base"
        />
      </button>
      <div class="w-px h-4 bg-accented mx-1" />
      <button
        type="button"
        title="Inline code (⌘E)"
        class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
        @mousedown.prevent
        @click="insertMarkdown('code')"
      >
        <UIcon
          name="i-lucide-code"
          class="text-base"
        />
      </button>
      <button
        type="button"
        title="Code block"
        class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
        @mousedown.prevent
        @click="insertMarkdown('codeblock')"
      >
        <UIcon
          name="i-lucide-square-code"
          class="text-base"
        />
      </button>
      <div class="w-px h-4 bg-accented mx-1" />
      <button
        type="button"
        title="Quote"
        class="p-1.5 rounded-md text-dimmed hover:text-default hover:bg-elevated transition-colors"
        @mousedown.prevent
        @click="insertMarkdown('quote')"
      >
        <UIcon
          name="i-lucide-text-quote"
          class="text-base"
        />
      </button>
      <template v-if="$slots['toolbar-append']">
        <div class="w-px h-4 bg-accented mx-1" />
        <slot name="toolbar-append" />
      </template>
    </div>

    <!-- Write tab -->
    <div
      v-show="editTab === 'write'"
      class="relative"
    >
      <textarea
        ref="textareaEl"
        v-model="modelValue"
        :placeholder="placeholder"
        class="w-full text-base text-toned placeholder-zinc-300 dark:placeholder-zinc-600 bg-default border-0 px-4 py-3 outline-none transition-all resize-y leading-[1.7]"
        :style="{ minHeight: `${minHeight}px`, ...(maxHeight != null ? { maxHeight: `${maxHeight}px` } : {}) }"
        @keydown="onKeydown"
        @input="emit('textarea-input', $event)"
      />
      <slot name="after-textarea" />
    </div>

    <!-- Preview tab -->
    <div
      v-show="editTab === 'preview'"
      class="px-4 py-3 bg-default overflow-y-auto"
      :style="{ minHeight: `${minHeight}px`, ...(maxHeight != null ? { maxHeight: `${maxHeight}px` } : {}) }"
    >
      <ProseDescription
        v-if="modelValue"
        :content="modelValue"
      />
      <slot
        v-else
        name="preview-empty"
      >
        <p class="text-base text-dimmed italic">
          Nothing to preview
        </p>
      </slot>
    </div>
  </div>
</template>
