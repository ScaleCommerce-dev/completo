<script setup lang="ts">
const props = withDefaults(defineProps<{
  placeholder?: string
  minHeight?: number
  maxHeight?: number | null
}>(), {
  placeholder: 'Describe the task...',
  minHeight: 120,
  maxHeight: null
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
      case 'bold': insert = `**${selected}**`; break
      case 'italic': insert = `*${selected}*`; break
      case 'code': insert = `\`${selected}\``; break
      case 'codeblock': insert = `\n\`\`\`\n${selected}\n\`\`\`\n`; break
      case 'quote': insert = selected.split('\n').map(l => `> ${l}`).join('\n'); break
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

function startEditing() {
  editTab.value = 'write'
  nextTick(() => {
    const el = textareaEl.value
    if (!el) return
    el.style.height = 'auto'
    const computed = props.maxHeight != null
      ? Math.max(props.minHeight, Math.min(el.scrollHeight, props.maxHeight))
      : Math.max(props.minHeight, el.scrollHeight)
    el.style.height = computed + 'px'
    el.setSelectionRange(0, 0)
    el.focus()
    el.scrollTop = 0
  })
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey)) {
    if (e.key === 'b') { e.preventDefault(); insertMarkdown('bold'); return }
    if (e.key === 'i') { e.preventDefault(); insertMarkdown('italic'); return }
    if (e.key === 'e') { e.preventDefault(); insertMarkdown('code'); return }
  }
  emit('textarea-keydown', e)
}

defineExpose({ textareaEl, insertMarkdown, editTab, startEditing })
</script>

<template>
  <div class="rounded-lg border border-zinc-200/80 dark:border-zinc-700/50 overflow-hidden">
    <!-- Tabs -->
    <div class="flex items-center border-b border-zinc-200/80 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/40">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold transition-colors border-b-2 -mb-px"
        :class="editTab === 'write'
          ? 'text-zinc-800 dark:text-zinc-200 border-indigo-500'
          : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'"
        @click="editTab = 'write'"
      >
        <UIcon name="i-lucide-pencil" class="text-[12px]" />
        Write
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold transition-colors border-b-2 -mb-px"
        :class="editTab === 'preview'
          ? 'text-zinc-800 dark:text-zinc-200 border-indigo-500'
          : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'"
        @click="editTab = 'preview'"
      >
        <UIcon name="i-lucide-eye" class="text-[12px]" />
        Preview
      </button>
      <template v-if="$slots['toolbar-right']">
        <div class="ml-auto flex items-center pr-3">
          <slot name="toolbar-right" />
        </div>
      </template>
    </div>

    <!-- Toolbar (write tab only) -->
    <div v-show="editTab === 'write'" class="flex items-center gap-0.5 px-3 py-1.5 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/20">
      <button type="button" title="Bold (⌘B)" class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors" @mousedown.prevent @click="insertMarkdown('bold')">
        <UIcon name="i-lucide-bold" class="text-[14px]" />
      </button>
      <button type="button" title="Italic (⌘I)" class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors" @mousedown.prevent @click="insertMarkdown('italic')">
        <UIcon name="i-lucide-italic" class="text-[14px]" />
      </button>
      <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <button type="button" title="Inline code (⌘E)" class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors" @mousedown.prevent @click="insertMarkdown('code')">
        <UIcon name="i-lucide-code" class="text-[14px]" />
      </button>
      <button type="button" title="Code block" class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors" @mousedown.prevent @click="insertMarkdown('codeblock')">
        <UIcon name="i-lucide-square-code" class="text-[14px]" />
      </button>
      <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <button type="button" title="Quote" class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors" @mousedown.prevent @click="insertMarkdown('quote')">
        <UIcon name="i-lucide-text-quote" class="text-[14px]" />
      </button>
      <template v-if="$slots['toolbar-append']">
        <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <slot name="toolbar-append" />
      </template>
    </div>

    <!-- Write tab -->
    <div v-show="editTab === 'write'" class="relative">
      <textarea
        ref="textareaEl"
        v-model="modelValue"
        :placeholder="placeholder"
        class="w-full text-[14px] text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800/60 border-0 px-4 py-3 outline-none transition-all resize-y leading-[1.7]"
        :style="{ minHeight: `${minHeight}px`, ...(maxHeight != null ? { maxHeight: `${maxHeight}px` } : {}) }"
        @keydown="onKeydown"
        @input="emit('textarea-input', $event)"
      />
      <slot name="after-textarea" />
    </div>

    <!-- Preview tab -->
    <div v-show="editTab === 'preview'" class="px-4 py-3 bg-white dark:bg-zinc-800/60 overflow-y-auto" :style="{ minHeight: `${minHeight}px`, ...(maxHeight != null ? { maxHeight: `${maxHeight}px` } : {}) }">
      <ProseDescription v-if="modelValue" :content="modelValue" />
      <p v-else class="text-[14px] text-zinc-300 dark:text-zinc-600 italic">Nothing to preview</p>
    </div>
  </div>
</template>
