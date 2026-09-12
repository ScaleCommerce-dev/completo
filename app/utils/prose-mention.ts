import { Node, mergeAttributes } from '@tiptap/core'

/**
 * `@[Display Name](userId)` as an atomic node.
 *
 * The stored syntax is a link with an `@` in front of it, and left alone that is
 * exactly what Tiptap makes of it — the markdown round-trips, but inside the editor
 * the user-id sits in an editable `href` with a caret position in the middle of it.
 * Backspacing through a mention then leaves `@[Jane Doe](8f3a2b)` behind, which still
 * looks like a mention and resolves to nobody: `extractMentionedUserIds` reads the
 * markdown source, so a truncated id is a silently missed notification. Carrying the
 * id was the whole point of the syntax (display names are not unique, and matching on
 * them notified the wrong person), so the editor has to treat it as one thing.
 *
 * `atom: true` is what does that. The node has no editable interior, so the caret
 * steps over it and Backspace removes the mention whole.
 *
 * The tokenizer is marked's extension API, the same shape as the one `ProseDescription`
 * registers for rendering — deliberately, since both have to agree on what a mention
 * is. The two cannot literally share code: that one emits an HTML string and discards
 * the id, this one produces a ProseMirror node and must keep it. The pattern is the
 * part that has to match, so it is exported and asserted against in `mentions.test.ts`.
 */
export const MENTION_PATTERN = /^@\[([^\]]+)\]\(([^)\s]+)\)/

export const ProseMention = Node.create({
  name: 'completoMention',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      /**
       * Rendered as `data-*` rather than through the default attribute mapping,
       * which would spell these as `id` and `label` — putting a raw user-id into
       * the document's `id` attribute, where it collides with every other id on
       * the page and is one `getElementById` away from being load-bearing.
       */
      id: {
        default: null,
        parseHTML: el => el.getAttribute('data-mention-id'),
        renderHTML: attrs => (attrs.id ? { 'data-mention-id': attrs.id } : {})
      },
      label: {
        default: null,
        parseHTML: el => el.getAttribute('data-mention-label'),
        renderHTML: attrs => (attrs.label ? { 'data-mention-label': attrs.label } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    // `.mention` is the class the shared prose stylesheet paints — see the
    // RENDERED PROSE banner in `main.css`. The pill therefore looks the same
    // being written as it does once saved, which is the point of the rewrite.
    return ['span', mergeAttributes({ class: 'mention' }, HTMLAttributes), `@${node.attrs.label ?? ''}`]
  },

  /** So `getText()` — used by the AI request body and the search index — reads as prose. */
  renderText({ node }) {
    return `@${node.attrs.label ?? ''}`
  },

  markdownTokenName: 'completoMention',

  markdownTokenizer: {
    name: 'completoMention',
    level: 'inline',
    // marked only calls `tokenize` from here on, so a cheap `indexOf` keeps this
    // off the hot path for the overwhelming majority of text that has no mention.
    start: (src: string) => src.indexOf('@['),
    tokenize(src: string) {
      const match = MENTION_PATTERN.exec(src)
      if (!match) return
      return {
        type: 'completoMention',
        raw: match[0],
        label: match[1]!.trim(),
        id: match[2]!
      }
    }
  },

  parseMarkdown(token) {
    return {
      type: 'completoMention',
      attrs: { id: token.id as string, label: token.label as string }
    }
  },

  renderMarkdown(node) {
    const { label, id } = node.attrs ?? {}
    // A mention that has lost its id is no longer a mention — write it as plain
    // text rather than emitting `@[Name]()`, which the tokenizer would not match
    // and which nothing could resolve.
    if (!id) return label ? `@${label}` : ''
    return `@[${label}](${id})`
  }
})
