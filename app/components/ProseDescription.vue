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
      // `@[Display Name](userId)`. Mentions written before ids were stored no
      // longer match and fall through to plain text — deliberate, see
      // extractMentionedUserIds in server/utils/notifications.ts.
      const match = src.match(/^@\[([^\]]+)\]\(([^)\s]+)\)/)
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

/**
 * Force rel="noopener noreferrer" on all links.
 *
 * Guarded like the `marked` block above, and for a stronger reason than HMR:
 * `addHook` registers on the DOMPurify *module*, and hooks are never removed.
 * This runs in `<script setup>`, so it ran once per instance — a card with
 * twenty comments installed twenty identical hooks, each one running on every
 * sanitize for the rest of the session. The output stayed correct, which is why
 * nothing caught it; the cost is the whole hook chain re-walking every node.
 */
const _linkHookInstalled = '__proseLinkHookInstalled'
if (!(globalThis as Record<string, unknown>)[_linkHookInstalled]) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer')
      if (node.getAttribute('target') === '_blank' || node.getAttribute('href')?.startsWith('http')) {
        node.setAttribute('target', '_blank')
      }
    }
  })
  ;(globalThis as Record<string, unknown>)[_linkHookInstalled] = true
}

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

// ─── Code blocks get a copy button ──────────────────────────────────────────
/**
 * A code block in a description is there to be run, and selecting one by hand
 * inside a scrolling panel is the fiddliest copy on either card surface.
 *
 * Decorated **after** sanitizing rather than by teaching `marked` to emit the
 * wrapper, which is the version that looks tidier and isn't. Emitting it from the
 * renderer means adding `div` to `ALLOWED_TAGS`, and `marked` passes raw HTML in a
 * description straight through — so the wrapper markup would arrive by widening
 * what *user* markdown is allowed to render, to buy a button we can just as easily
 * build ourselves. Everything below runs on our own post-sanitize DOM and the
 * allow-lists above stay exactly as narrow as they were.
 *
 * The language label is free: `language-ts` is already on the `<code>` and `class`
 * is already allowed, so it is read rather than plumbed.
 */
const root = useTemplateRef<HTMLElement>('root')

/**
 * Inline SVG because these are injected into raw DOM, where `UIcon` isn't
 * available — and both states ship at once so copying swaps a class rather than
 * re-rendering markup (see `.code-copy` below).
 */
const ICONS = '<svg class="code-icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
  + '<svg class="code-icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

function decorateCodeBlocks() {
  const el = root.value
  if (!el) return

  for (const pre of el.querySelectorAll<HTMLElement>('pre')) {
    if (pre.parentElement?.classList.contains('code-block')) continue

    const wrap = document.createElement('div')
    wrap.className = 'code-block'
    pre.parentElement?.insertBefore(wrap, pre)
    wrap.appendChild(pre)

    const bar = document.createElement('div')
    bar.className = 'code-bar'

    const language = pre.querySelector('code')?.className.match(/language-([\w+#.-]+)/)?.[1]
    if (language) {
      const tag = document.createElement('span')
      tag.className = 'code-lang'
      tag.textContent = language
      bar.appendChild(tag)
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'code-copy'
    button.setAttribute('aria-label', 'Copy code')
    button.innerHTML = ICONS
    bar.appendChild(button)

    wrap.appendChild(bar)
  }
}

/**
 * `v-html` replaces the container's children wholesale on every update, so the
 * wrappers are discarded with the content they belonged to and re-made here —
 * which is also why `decorateCodeBlocks` can simply skip anything already wrapped
 * instead of tracking what it has seen.
 */
onMounted(decorateCodeBlocks)
watch(rendered, () => nextTick(decorateCodeBlocks))

const copyTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

/** One delegated handler, so a block added by an edit needs no new listener. */
async function onCodeCopy(e: MouseEvent) {
  const button = (e.target as HTMLElement | null)?.closest<HTMLElement>('.code-copy')
  if (!button) return

  const code = button.closest('.code-block')?.querySelector('pre')
  if (!code) return

  try {
    await navigator.clipboard.writeText(code.innerText.replace(/\n+$/, ''))
  } catch {
    // Rejects outside a secure context or when the document isn't focused. The
    // text is still selectable, and an error toast here would be the loudest
    // thing on screen for the least consequential failure there is.
    return
  }

  button.classList.add('copied')
  const running = copyTimers.get(button)
  if (running) clearTimeout(running)
  copyTimers.set(button, setTimeout(() => {
    button.classList.remove('copied')
    copyTimers.delete(button)
  }, 2000))
}

onUnmounted(() => {
  for (const timer of copyTimers.values()) clearTimeout(timer)
  copyTimers.clear()
})
</script>

<template>
  <div
    ref="root"
    class="prose prose-sm dark:prose-invert prose-description"
    :class="props.class"
    @click="onCodeCopy"
    v-html="rendered"
  />
</template>

<style scoped>
/*
 * Typography's palette, expressed in the app's semantic tokens.
 *
 * This block used to be thirty lines of raw `zinc` and `indigo` plus a second
 * copy of itself under `:root.dark` — the hand-maintained dark mode the token
 * rule in CLAUDE.md exists to prevent, which slipped in because
 * `design-tokens.test.ts` reads utility classes and these were custom
 * properties. The `--ui-*` variables already carry both themes, so the dark
 * override below is down to the two values that genuinely differ rather than a
 * duplicate of every line.
 */
.prose-description {
  --tw-prose-body: var(--ui-text-toned);
  --tw-prose-headings: var(--ui-text-highlighted);
  --tw-prose-links: var(--ui-primary);
  --tw-prose-bold: var(--ui-text);
  --tw-prose-code: var(--ui-primary);
  --tw-prose-pre-bg: var(--ui-bg-muted);
  --tw-prose-pre-code: var(--ui-text-toned);
  --tw-prose-quotes: var(--ui-text-muted);
  --tw-prose-quote-borders: var(--ui-border-accented);
  --tw-prose-counters: var(--ui-text-dimmed);
  --tw-prose-bullets: var(--ui-border-accented);
  --tw-prose-hr: var(--ui-border);
  --tw-prose-th-borders: var(--ui-border-accented);
  --tw-prose-td-borders: var(--ui-border-muted);
  max-width: none;
  font-size: var(--text-base);
  line-height: 1.7;
}

/*
 * Text has a ceiling, but a screen-reading one rather than a print one.
 *
 * This was 36rem — about 79 characters — on the strength of the familiar 45–75
 * rule. That rule is Bringhurst's, and it describes a *single-column serif page
 * in print*; the screen evidence points the other way. Shaikh's 2005 study of
 * online news found reading speed and efficiency highest at 95 cpl of the four
 * widths tested, with no effect on comprehension, and the earlier Dyson &
 * Haselgrove result that favoured 55 cpl was measuring a different thing —
 * comprehension under instructions to read fast.
 *
 * What the neighbours do, measured rather than assumed: GitHub caps an issue
 * body at 878px / 14px — 125 characters — and holds that at 1440 and 1920 alike,
 * and a README at 838px / 16px, 106 characters. Linear's docs run 650px / 15px,
 * 84 characters. Our audience reads GitHub issues all day, so 79 was the outlier
 * here, not the safe choice.
 *
 * 52rem is 832px, about 114 characters at our 14px. It is deliberately inert
 * inside the card panel at every width the panel actually takes — prose fills it
 * — and exists for the card *page*, whose main column runs past 1100px and would
 * otherwise reach ~150. The generous 1.7 line-height is what makes a measure
 * this wide comfortable: long lines want more leading, and these have it.
 */
.prose-description :deep(> *) {
  max-width: var(--prose-measure, 52rem);
}

/* What the extra width is actually for. These have no measure to blow. */
.prose-description :deep(> .code-block),
.prose-description :deep(> pre),
.prose-description :deep(> table),
.prose-description :deep(> img) {
  max-width: none;
}

/* A comment's prose must start and end flush with its own box, or the rhythm the
   thread is built on stops being a rhythm.

   These reset every block, not just `p` — which is what they used to do, and it
   only ever looked right because most comments are paragraphs. Measured on
   TK-21: the one comment ending in a fenced code block kept typography's 16px
   bottom margin *inside* its `<li>`, so it sat 40px from the comment below it
   where every other pair sat at 24. A single 40px gap in a stack of 24s reads as
   a missing record, and it takes a devtools measurement to see why — exactly the
   sort of thing that gets diagnosed as "the spacing is off" and fixed by
   changing `space-y-6`, which would then be wrong four times to be right once.

   `:deep(> :first-child)` rather than a list of element types: a leading `<ul>`,
   heading or blockquote has the same problem at the top, and any renderer change
   that emits a new wrapper (the code-block decoration already does) would need
   adding to a list nobody would remember. */
.prose-description :deep(> :first-child) {
  margin-top: 0;
}
.prose-description :deep(> :last-child) {
  margin-bottom: 0;
}
:deep(a) {
  text-decoration-color: color-mix(in oklab, var(--ui-primary) 40%, transparent);
  text-underline-offset: 2px;
  transition: color 0.15s;
}
:deep(a:hover) {
  color: color-mix(in oklab, var(--ui-primary) 80%, var(--ui-text-highlighted));
}
/*
 * Inline code and mentions used to be the two loudest sources of *size* noise on
 * a comment thread, which is a strange thing for decorations to be. Measured
 * across one thread there were seven type sizes, five of them inside a 2.4px
 * range — 11.57px (code in a block), 11.9px (inline code), 12px (the byline),
 * 12.6px (a mention) and 14px (the prose) — and no two of those differences read
 * as hierarchy. They read as a page that couldn't settle, which is exactly what
 * a reader reports as "restless" without being able to point at a cause.
 *
 * So: 0.857em, which lands inline code on 12px at the 14px body size, i.e. on the
 * app's closed scale and on the same step as the byline beside it. `em` rather
 * than `12px` because a description may put code inside a heading, where it has
 * to scale with its host.
 */
:deep(code:not(pre code)) {
  font-size: 0.857em;
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: var(--ui-bg-elevated);
  font-weight: 500;
}
:deep(code:not(pre code))::before,
:deep(code:not(pre code))::after {
  content: none;
}
:deep(pre) {
  border-radius: 8px;
  /*
   * `--ui-border-accented`, not `--ui-border`: in dark mode `--ui-border` and
   * `--ui-bg-muted` resolve to the same 27.4% lightness, so the hairline round a
   * code block drew itself in the block's own colour and disappeared. One step
   * along the ramp is visible against the slab in both themes, which is what lets
   * the dark override below stay a single rule.
   */
  border: 1px solid var(--ui-border-accented);
  /*
   * `--text-sm` is the app's workhorse step, spelled as the token rather than as
   * the 13px behind it. It was a literal 13.5px, which is on no scale at all —
   * and it never rendered anyway: typography's own `code` rule sets 0.857em and
   * wins against `pre`, so every code block in the app was drawing at
   * 13.5 × 0.857 = 11.57px while this line claimed otherwise. Hence the `pre code`
   * reset below; without it the declaration here is decoration.
   */
  font-size: var(--text-sm);
  /* The wrapper carries the block's spacing, so the two can't double up. */
  margin: 0;
}
:deep(pre code) {
  font-size: inherit;
}
:deep(.mention) {
  display: inline-flex;
  align-items: center;
  /*
   * A mention is the same size as the sentence it sits in. At 0.9em it was 12.6px
   * inside 14px prose — a step too small to mean anything and big enough to make
   * the line ripple, and three of TK-21's comments open with one. The pill, the
   * weight and the brand colour already say "this is a person"; size was the one
   * signal doing no work and costing the most.
   */
  font-size: inherit;
  font-weight: 600;
  color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary) 8%, transparent);
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
  accent-color: var(--ui-primary);
}

/*
 * The copy button, and the language it is copying.
 *
 * Quiet until the block is reached, because a description of five snippets would
 * otherwise carry five lit buttons — the same rule the comment rows and the
 * attachment rows follow. `focus-within` keeps it reachable by keyboard, and it
 * stays lit for the two seconds after a copy so the confirmation isn't dismissed
 * by the pointer moving away from what it just clicked.
 */
:deep(.code-block) {
  position: relative;
  margin: 1.15em 0;
}
:deep(.code-bar) {
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0;
  transition: opacity 0.15s;
}
:deep(.code-block:hover .code-bar),
:deep(.code-block:focus-within .code-bar),
:deep(.code-bar:has(.copied)) {
  opacity: 1;
}
:deep(.code-lang) {
  font-family: var(--font-mono, ui-monospace);
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
  user-select: none;
}
:deep(.code-copy) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 6px;
  color: var(--ui-text-dimmed);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
:deep(.code-copy:hover) {
  color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
  border-color: var(--ui-border-accented);
}
:deep(.code-copy.copied) {
  color: var(--ui-success);
  border-color: color-mix(in oklab, var(--ui-success) 40%, transparent);
}
:deep(.code-copy svg) {
  width: 0.8rem;
  height: 0.8rem;
}
/* One glyph at a time: `.copied` swaps which, so no markup is rebuilt. */
:deep(.code-copy .code-icon-done),
:deep(.code-copy.copied .code-icon-copy) {
  display: none;
}
:deep(.code-copy.copied .code-icon-done) {
  display: block;
}

/*
 * All that is left of the dark override, and the reason it is needed at all.
 *
 * A recessed surface reads *lighter* in dark mode — there is nowhere darker to go
 * — so `--ui-bg-muted` is the right token for a code block in both themes and
 * needs no per-theme value. The inline chip is the exception: it uses
 * `--ui-bg-elevated`, which in dark resolves to the same 27.4% as `--ui-bg-muted`
 * and would leave a `code` span inside a paragraph indistinguishable from a code
 * block sitting next to it. One step further along the ramp separates them.
 */
:root.dark .prose-description :deep(code:not(pre code)) {
  background: var(--ui-bg-accented);
}
</style>
