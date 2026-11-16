import type { SubtaskProgress } from '~/types/card'

/**
 * The client half of the sub-task rules in `server/utils/subtasks.ts`. The
 * server refuses a parent entering Done while a sub-task is open; these let the
 * board and the status menus say so before the request instead of after it.
 */

/** How many of a card's sub-tasks are not done yet. */
export function openSubtaskCount(card: { subtasks?: SubtaskProgress | null }): number {
  const p = card.subtasks
  return p ? p.total - p.done : 0
}

/** The hint a disabled Done option carries: "2 sub-tasks open". */
export function openSubtasksHint(open: number): string {
  return `${open} sub-task${open === 1 ? '' : 's'} open`
}

/**
 * A list's rows with each sub-task moved directly under its parent.
 *
 * The rows arrive in the table's sort order, and both halves keep it: parents
 * stay where the sort put them, and a parent's sub-tasks follow it in the order
 * the sort gave them. A sub-task whose parent is not among the rows — filtered
 * out, or done past retention — stays where the sort put it, since there is
 * nothing to sit under. One level, so no recursion.
 */
export function nestUnderParents<T extends { id: number, parentId?: number | null }>(rows: readonly T[]): T[] {
  const present = new Set(rows.map(r => r.id))
  const nested = (r: T) => r.parentId != null && present.has(r.parentId)
  const children = new Map<number, T[]>()
  for (const r of rows) {
    if (!nested(r)) continue
    const list = children.get(r.parentId!)
    if (list) list.push(r)
    else children.set(r.parentId!, [r])
  }
  const out: T[] = []
  for (const r of rows) {
    if (nested(r)) continue
    out.push(r)
    out.push(...(children.get(r.id) ?? []))
  }
  return out
}
