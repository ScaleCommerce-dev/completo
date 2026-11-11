/**
 * Uncheck every Markdown task-list item (`- [x] done` → `- [ ] done`).
 *
 * A duplicated card starts its checklist over: the source is typically a
 * template whose boxes were never ticked, but copying a card someone has already
 * worked through must not hand over their progress. Only list markers at the
 * start of a line are touched, so a literal "[x]" inside a sentence or a code
 * span stays as written.
 */
export function resetTaskList(markdown: string | null | undefined): string {
  if (!markdown) return ''
  return markdown.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[xX]\]/gm, '$1[ ]')
}
