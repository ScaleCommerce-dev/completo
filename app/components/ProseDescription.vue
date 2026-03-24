<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
  class?: string
}>()

// Guard against duplicate extension registration (HMR)
const _markedConfigured = '__markedMentionConfigured'
if (!(globalThis as Record<string, unknown>)[_markedConfigured]) {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  const mentionExtension = {
    name: 'mention',
    level: 'inline' as const,
    start(src: string) { return src.indexOf('@') },
    tokenizer(src: string) {
      const match = src.match(/^@\[([^\]]+)\]/)
      if (match) {
        return {
          type: 'mention',
          raw: match[0],
          name: match[1]!.trim()
        }
      }
    },
    renderer(token: { name: string }) {
      const escaped = token.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<span class="mention">@${escaped}</span>`
    }
  }

  marked.use({ extensions: [mentionExtension] })
  ;(globalThis as Record<string, unknown>)[_markedConfigured] = true
}

// Force rel="noopener noreferrer" on all links
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer')
    if (node.getAttribute('target') === '_blank' || node.getAttribute('href')?.startsWith('http')) {
      node.setAttribute('target', '_blank')
    }
  }
})

const rendered = computed(() => {
  if (!props.content) return ''
  const raw = marked.parse(props.content) as string
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'a', 'code', 'pre', 'span',
      'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'input'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'type', 'checked', 'disabled']
  })
})
</script>

<template>
  <div
    class="prose prose-sm dark:prose-invert prose-description"
    :class="props.class"
    v-html="rendered"
  />
</template>

<style scoped>
.prose-description {
  --tw-prose-body: var(--color-zinc-600);
  --tw-prose-headings: var(--color-zinc-800);
  --tw-prose-links: var(--color-indigo-500);
  --tw-prose-bold: var(--color-zinc-700);
  --tw-prose-code: var(--color-indigo-600);
  --tw-prose-pre-bg: var(--color-zinc-50);
  --tw-prose-pre-code: var(--color-zinc-700);
  --tw-prose-quotes: var(--color-zinc-500);
  --tw-prose-quote-borders: var(--color-indigo-200);
  --tw-prose-counters: var(--color-zinc-400);
  --tw-prose-bullets: var(--color-zinc-300);
  --tw-prose-hr: var(--color-zinc-200);
  --tw-prose-th-borders: var(--color-zinc-200);
  --tw-prose-td-borders: var(--color-zinc-100);
  max-width: none;
  font-size: 14px;
  line-height: 1.7;
}

:deep(p:first-child) {
  margin-top: 0;
}
:deep(p:last-child) {
  margin-bottom: 0;
}
:deep(a) {
  text-decoration-color: var(--color-indigo-300);
  text-underline-offset: 2px;
  transition: color 0.15s;
}
:deep(a:hover) {
  color: var(--color-indigo-600);
}
:deep(code:not(pre code)) {
  font-size: 0.85em;
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: var(--color-zinc-100);
  font-weight: 500;
}
:deep(code:not(pre code))::before,
:deep(code:not(pre code))::after {
  content: none;
}
:deep(pre) {
  border-radius: 8px;
  border: 1px solid var(--color-zinc-200);
  font-size: 13.5px;
}
:deep(.mention) {
  display: inline-flex;
  align-items: center;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--color-indigo-600);
  background: oklch(from var(--color-indigo-500) l c h / 0.08);
  padding: 0.05em 0.4em;
  border-radius: 9999px;
  white-space: nowrap;
}
:deep(blockquote) {
  font-style: normal;
  border-left-width: 3px;
}
:deep(img) {
  border-radius: 8px;
}
:deep(input[type="checkbox"]) {
  margin-right: 0.35em;
  accent-color: var(--color-indigo-500);
}

/* Dark mode overrides */
:root.dark .prose-description {
  --tw-prose-body: var(--color-zinc-300);
  --tw-prose-headings: var(--color-zinc-100);
  --tw-prose-links: var(--color-indigo-400);
  --tw-prose-bold: var(--color-zinc-200);
  --tw-prose-code: var(--color-indigo-400);
  --tw-prose-pre-bg: oklch(from var(--color-zinc-800) l c h / 0.6);
  --tw-prose-pre-code: var(--color-zinc-300);
  --tw-prose-quotes: var(--color-zinc-400);
  --tw-prose-quote-borders: oklch(from var(--color-indigo-500) l c h / 0.4);
  --tw-prose-counters: var(--color-zinc-500);
  --tw-prose-bullets: var(--color-zinc-600);
  --tw-prose-hr: var(--color-zinc-700);
  --tw-prose-th-borders: var(--color-zinc-700);
  --tw-prose-td-borders: var(--color-zinc-800);
}
:root.dark .prose-description :deep(code:not(pre code)) {
  background: var(--color-zinc-800);
}
:root.dark .prose-description :deep(pre) {
  border-color: var(--color-zinc-700);
}
:root.dark .prose-description :deep(.mention) {
  color: var(--color-indigo-400);
  background: oklch(from var(--color-indigo-400) l c h / 0.12);
}
</style>
