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
