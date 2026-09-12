// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import Code from '@tiptap/extension-code'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Image from '@tiptap/extension-image'
import { PROSE_EXTENSIONS } from '../../app/utils/prose-extensions'

const ROOT = join(import.meta.dirname, '../..')

/**
 * The claim the whole WYSIWYG rewrite rests on: a card's description survives being
 * opened in the editor.
 *
 * The database stores Markdown, the CLI reads Markdown, `ProseDescription` renders
 * Markdown — none of that changed. What changed is that the text now makes a round
 * trip through a ProseMirror document every time someone edits a card, and anything
 * the parser cannot represent is *gone on save*, silently and irreversibly. That is
 * not a theoretical risk: without a table extension a GFM table parses to nothing
 * and saves as nothing, which is how `TableKit` ended up in `PROSE_EXTENSIONS`.
 *
 * So this is a behavioural test rather than a source-level one, and it is the only
 * test in the unit project that mounts anything. It is worth the exception: no
 * assertion about the *shape* of the component can tell you whether a table survives.
 */

/**
 * `UEditor`'s own stack, mirrored — plus ours, imported rather than copied.
 *
 * The mirrored half is the part that can drift, so `mirrors what UEditor brings`
 * below checks it against Nuxt UI's source instead of trusting this comment. Our
 * half comes from `PROSE_EXTENSIONS`, the same array the component passes, so it
 * cannot drift at all.
 */
function makeEditor() {
  return new Editor({
    extensions: [
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
      StarterKit.configure({ code: false, horizontalRule: false, link: { openOnClick: false } }),
      Code.extend({ excludes: 'code' }),
      HorizontalRule,
      Image,
      ...PROSE_EXTENSIONS
    ],
    content: '',
    contentType: 'markdown'
  })
}

/**
 * Two differences that are output formatting rather than content, and are stable:
 * `breaks: true` writes a soft newline as a trailing-double-space hard break, and
 * table cells are padded to an even column width. Both render identically through
 * `marked` and read the same in a terminal.
 */
const normalise = (md: string) => md
  .replace(/ {2}\n/g, '\n')
  .replace(/ +\|/g, ' |')
  .replace(/\| +/g, '| ')
  .trim()

/** Every shape this app actually writes into a description or a comment. */
const CONTENT: Record<string, string> = {
  'a mention': '@[Jane Doe](8f3a2b1c) please look at this',
  'two mentions in a line': 'cc @[Jane Doe](8f3a2b1c) and @[Tom L](4d5e6f7a)',
  'a mention inside a task': '- [ ] ask @[Jane Doe](8f3a2b1c)',
  'a card link': 'See [Fix login (CF-12)](/projects/completo/cards/CF-12)',
  'a GFM table': '| a | b |\n| --- | --- |\n| 1 | 2 |',
  'task lists': '- [ ] one\n- [x] two done',
  'nested bullets': '- outer\n  - inner\n    - deepest',
  'an ordered list': '1. first\n2. second',
  'inline marks': '**bold** and *italic* and `code` and ~~strike~~',
  'a fenced block with a language': '```ts\nconst x = 1\n```',
  'an attachment image': '![shot](/api/attachments/abc/download)',
  'a blockquote': '> quoted line\n> second',
  'a horizontal rule': 'a\n\n---\n\nb',
  'a soft line break': 'line one\nline two',
  'headings': '## Editor Improvements\n\nBody text.',
  // The characters a serializer either eats or italicises. Tiptap escapes the
  // intra-word underscores on the way out — `file\_name\_here` — which is
  // CommonMark-correct and renders identically through `marked`, so a card reads
  // the same before and after an edit. What it costs is a little noise for anyone
  // reading the raw Markdown in a terminal. Asserted as the escaped form rather
  // than normalised away, so that if a future Tiptap stops escaping (or starts
  // escaping something else) this says so instead of passing quietly.
  'underscores and asterisks in prose': 'file\\_name\\_here and 2*3*4',
  'a realistic card body': '## Acceptance Criteria\n\n- [ ] Editor renders **formatted** text\n- [ ] Uses `UButton`\n\nSee @[Tom](8f3a2b1c).'
}

describe('markdown survives the editor', () => {
  it.each(Object.entries(CONTENT))('round-trips %s', (_name, markdown) => {
    const editor = makeEditor()
    editor.commands.setContent(markdown, { contentType: 'markdown' })

    expect(normalise(editor.getMarkdown())).toBe(normalise(markdown))
  })

  it.each(Object.entries(CONTENT))('normalises %s once, not on every edit', (_name, markdown) => {
    // The first save may tidy the source — `*` bullets become `-`, a loose list
    // becomes tight. What would be intolerable is that tidying *continuing*: every
    // open-and-close rewriting the field would turn a card's history into noise and
    // make `dirty` meaningless. So the second pass has to be byte-identical.
    const editor = makeEditor()
    editor.commands.setContent(markdown, { contentType: 'markdown' })
    const first = editor.getMarkdown()
    editor.commands.setContent(first, { contentType: 'markdown' })

    expect(editor.getMarkdown()).toBe(first)
  })
})

describe('a mention is one thing', () => {
  it('parses to an atomic node that keeps the user id', () => {
    // The id is the entire reason the syntax exists — display names are not unique,
    // and matching on them notified the wrong person. As a link the id sits in an
    // editable href with caret positions inside it; `atom` is what stops a mention
    // from being half-deleted into something that resolves to nobody.
    const editor = makeEditor()
    editor.commands.setContent('hi @[Jane Doe](8f3a2b1c)', { contentType: 'markdown' })

    const node = editor.getJSON().content?.[0]?.content?.find(n => n.type === 'completoMention')

    expect(node?.attrs).toEqual({ id: '8f3a2b1c', label: 'Jane Doe' })
    expect(editor.schema.nodes.completoMention?.isAtom).toBe(true)
  })

  it('renders the pill the shared stylesheet paints', () => {
    // `.mention` is styled once, in main.css, for both the editor and the renderer —
    // so a mention being written looks like a mention already saved.
    const editor = makeEditor()
    editor.commands.setContent('@[Jane Doe](8f3a2b1c)', { contentType: 'markdown' })

    expect(editor.getHTML()).toContain('class="mention"')
  })

  it('reads as plain prose in getText', () => {
    // What the AI request body and anything else reading the document sees.
    const editor = makeEditor()
    editor.commands.setContent('cc @[Jane Doe](8f3a2b1c) thanks', { contentType: 'markdown' })

    expect(editor.getText()).toBe('cc @Jane Doe thanks')
  })
})

describe('the test fixture tracks the real editor', () => {
  it('mirrors what UEditor brings', () => {
    // `makeEditor` rebuilds Nuxt UI's half of the stack by hand, which is the one
    // thing here that can silently go stale: a Nuxt UI release that adds an
    // extension would leave this suite testing an editor the app no longer has.
    // Read from its source rather than restated, so the drift fails loudly.
    const source = readFileSync(join(ROOT, 'node_modules/@nuxt/ui/dist/runtime/components/Editor.vue'), 'utf8')
    const imported = [...source.matchAll(/from "(@tiptap\/[^"]+)"/g)].map(m => m[1]!)

    expect(new Set(imported)).toEqual(new Set([
      '@tiptap/core', // mergeAttributes only — not an extension
      '@tiptap/extension-code',
      '@tiptap/extension-horizontal-rule',
      '@tiptap/extension-image',
      '@tiptap/extension-mention', // disabled by the component: `:mention="false"`
      '@tiptap/extension-placeholder', // presentation only, nothing to round-trip
      '@tiptap/markdown',
      '@tiptap/starter-kit',
      '@tiptap/vue-3'
    ]))
  })

  it('builds every extension the component passes', () => {
    // The other half: ours is imported, so this only has to prove the array is not
    // empty — a `PROSE_EXTENSIONS` that silently became `[]` would make every
    // round-trip above pass on an editor with no tables and no mentions.
    const names = makeEditor().extensionManager.extensions.map(e => e.name)

    expect(names).toEqual(expect.arrayContaining(['table', 'taskList', 'taskItem', 'completoMention']))
  })
})
