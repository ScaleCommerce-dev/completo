import { eq, isNotNull } from 'drizzle-orm'

/**
 * Archived projects (CF-420), for the views that gather work *across* projects:
 * My Tasks, Calendar, its event stream and the ⌘K card search. They leave these
 * out, because archiving means "not something I am working on".
 *
 * Never use this for access. An archived project stays fully reachable to the
 * people who could reach it before: it opens at its URL, its own views work and
 * its API answers. `requireProjectMember` and `memberProjectIds` do not look at
 * `archivedAt`, and must not, or archiving would lock owners out of the project
 * they need to restore.
 */
export function archivedProjectIds(): Set<string> {
  return new Set(db.select({ id: schema.projects.id })
    .from(schema.projects)
    .where(isNotNull(schema.projects.archivedAt))
    .all()
    .map(p => p.id))
}

export function isProjectArchived(projectId: string): boolean {
  return !!db.select({ archivedAt: schema.projects.archivedAt })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()?.archivedAt
}
