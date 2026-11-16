import { sql, type SQL } from 'drizzle-orm'

/**
 * Done + retention: views leave out a done card once it has sat in the project's
 * done status longer than `doneRetentionDays`. Nothing is deleted, and `null`
 * retention keeps every card.
 *
 * One rule, two shapes: a condition for a query over one project's cards, and a
 * predicate for rows that span projects (My Tasks). It was written out five times,
 * and the board and list views loaded every expired card only to drop it in
 * JavaScript.
 */
type RetentionProject = { doneStatusId: string | null, doneRetentionDays: number | null }

function cutoffMs(project: RetentionProject): number | null {
  if (!project.doneStatusId || project.doneRetentionDays == null) return null
  return Date.now() - project.doneRetentionDays * 86400000
}

/** A `where` condition keeping every card of `project` but its expired done ones. */
export function notExpiredDone(project: RetentionProject): SQL | undefined {
  const cutoff = cutoffMs(project)
  if (cutoff === null) return undefined
  // `updatedAt` is stored in seconds (drizzle `mode: 'timestamp'`).
  return sql`NOT (${schema.cards.statusId} = ${project.doneStatusId} AND ${schema.cards.updatedAt} < ${Math.floor(cutoff / 1000)})`
}

/** Whether a card of `project` has sat in done past the retention window. */
export function isExpiredDone(card: { statusId: string, updatedAt: Date }, project: RetentionProject): boolean {
  const cutoff = cutoffMs(project)
  return cutoff !== null && card.statusId === project.doneStatusId && card.updatedAt.getTime() < cutoff
}
