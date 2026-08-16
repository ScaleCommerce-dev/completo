/**
 * What counts as a card search query, shared by `/api/cards/search` and the
 * command palette that calls it.
 *
 * The two have to agree or one of them is wrong in a way nothing reports: a
 * client floor that is stricter than the server's silently hides results the
 * API would have returned, and a looser one shows a spinner for a request that
 * can only come back empty.
 */

/**
 * Below this a substring match is worthless — one character is in most card
 * titles — and answering costs a scan of every card the caller can see.
 */
export const CARD_SEARCH_MIN_LENGTH = 2

/**
 * The card a query names outright, or null.
 *
 * "TK-42", "tk-42" and a bare "42" all mean card 42: a ticket id is the card id
 * with the project key in front (`formatTicketId`). The key is not verified —
 * whoever resolves the id already limits which project's cards they can reach,
 * and someone who typed the wrong prefix still wants the card they named.
 */
export function cardSearchId(q: string): number | null {
  const match = q.trim().match(/^(?:[A-Za-z]+-)?(\d+)$/)
  return match ? Number(match[1]) : null
}

/**
 * Whether a query can return anything.
 *
 * An id is exempt from the length floor: looking up card 7 is an indexed lookup
 * of one row, not a scan, and "7" is a perfectly ordinary thing to type.
 */
export function isCardSearchable(q: string): boolean {
  const trimmed = q.trim()
  return trimmed.length >= CARD_SEARCH_MIN_LENGTH || cardSearchId(trimmed) !== null
}

/** How much description the preview pane shows. About six lines in its column. */
export const SNIPPET_LENGTH = 260

/**
 * A description as one line of prose.
 *
 * The preview pane is 370px wide and shows a few lines, so a description is
 * flattened rather than rendered: at that width `## Requirements` and
 * `- [ ] Users can type…` spend two of the six lines on syntax, and a fenced
 * code block spends one on the fence. Markers go, their content stays.
 *
 * Deliberately not a markdown renderer. `ProseDescription` is the one of those,
 * and it needs the height of a card panel to be worth anything.
 */
function flattenMarkdown(text: string): string {
  return text
    .replace(/```[\w-]*\n?/g, '')
    // A table's alignment row is punctuation with no content at all, and once
    // the rows are on one line the outer pipes bound cells that have no columns
    // left to sit in. The inner pipes stay: they are what still separates
    // "02:41" from "Upload completes".
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '')
    .replace(/^[ \t]*\|[ \t]*/gm, '')
    .replace(/[ \t]*\|[ \t]*$/gm, '')
    // Headings and blockquotes, then list bullets and their task boxes.
    .replace(/^[ \t]*(?:#{1,6}|>)[ \t]*/gm, '')
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    // Links and images collapse to the words a reader would have read.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Emphasis and inline code. A lone `_` is left alone — stripping it turns
    // `card_id` into `cardid`, which is worse than the marker it removed.
    .replace(/(\*\*|\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cut to `max`, backing up to the last word boundary rather than mid-word. */
function trimToWord(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  // Only honour the boundary if it is near the end; a long unbroken token
  // (a URL, a stack frame) would otherwise throw most of the window away.
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()
}

/**
 * The part of a description worth showing for this query.
 *
 * Centred on the match rather than taken from the top: a card whose description
 * matched on its last paragraph would otherwise preview its first, which shows
 * the reader something true and unrelated — the worst kind of wrong, because it
 * reads as the reason the row is in the list.
 *
 * A third of the window goes in front of the match, so there is enough context
 * to read the sentence it sits in without pushing the match itself off the end.
 */
export function descriptionSnippet(description: string | null | undefined, query: string, length = SNIPPET_LENGTH): string | null {
  if (!description) return null
  const flat = flattenMarkdown(description)
  if (!flat) return null
  if (flat.length <= length) return flat

  const q = query.trim().toLowerCase()
  const at = q.length >= CARD_SEARCH_MIN_LENGTH ? flat.toLowerCase().indexOf(q) : -1
  if (at === -1) return `${trimToWord(flat, length)}…`

  let start = Math.max(0, at - Math.floor(length / 3))
  if (start > 0) {
    // Forward to a word boundary, but never past the match itself.
    const space = flat.indexOf(' ', start)
    if (space !== -1 && space < at) start = space + 1
  }
  const body = trimToWord(flat.slice(start), length)
  return `${start > 0 ? '…' : ''}${body}${start + body.length < flat.length ? '…' : ''}`
}

export interface TextSegment {
  text: string
  match: boolean
}

/**
 * Split text into the parts that matched the query and the parts that did not,
 * so a template can mark the match without any HTML being built from user text.
 *
 * The palette's own `labelHtml` / `descriptionHtml` props take a string of
 * markup, which for card titles and descriptions would mean composing HTML out
 * of whatever someone typed into a card — a sanitiser away from stored XSS on
 * the app origin. Segments cannot carry markup at all.
 */
export function matchSegments(text: string, query: string): TextSegment[] {
  if (!text) return []
  const q = query.trim()
  // A one-character query got here by naming a card id. Marking every "7" in a
  // paragraph lights up the text and points at nothing.
  if (q.length < CARD_SEARCH_MIN_LENGTH) return [{ text, match: false }]

  const haystack = text.toLowerCase()
  const needle = q.toLowerCase()
  const segments: TextSegment[] = []
  let at = 0

  for (;;) {
    const found = haystack.indexOf(needle, at)
    if (found === -1) break
    if (found > at) segments.push({ text: text.slice(at, found), match: false })
    segments.push({ text: text.slice(found, found + needle.length), match: true })
    at = found + needle.length
  }
  if (at < text.length) segments.push({ text: text.slice(at), match: false })

  return segments
}
