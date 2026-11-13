import type { InjectionKey, Ref } from 'vue'
import type { StatusCategory } from '../../shared/utils/workflow'
import type { PersonRef } from '~/types/card'

/**
 * The tracker interface's issue page vocabulary: references between issues, and
 * the one index of readable issues that resolves them.
 */

export interface IssueStatus {
  id: string
  name: string
  category: StatusCategory
  color: string | null
  position?: number
}

export interface IssueProgress { total: number, completed: number }

/**
 * A card shown inside another card (parent, sub-issue, relation), as
 * `GET /api/cards/:id` returns it. `hidden` is a card in a project the viewer
 * cannot read: id only, no title.
 */
export interface IssueRef {
  id: number
  hidden?: true
  /** `KEY-42`. */
  ticket?: string
  title?: string
  projectId?: string
  /** The ref's own project, for its address: it can sit in another project. */
  projectSlug?: string
  status?: IssueStatus
  archivedAt?: string | null
  relationId?: string
  childProgress?: IssueProgress | null
}

/** One row of `GET /api/issues`, as far as the issue page reads it. */
export interface IssueIndexEntry {
  id: number
  ticket: string
  title: string
  projectId: string
  parentId: number | null
  status: IssueStatus & { position: number }
  project: { id: string, name: string, slug: string, key: string, icon: string | null }
  assignee: PersonRef | null
  childProgress: IssueProgress | null
  archivedAt?: string | null
}

/**
 * Every issue the viewer can read, by id. The tracker issue page provides it;
 * rendered prose injects it, so a `KEY-42` resolves to a chip exactly when the
 * viewer may read that issue. Nothing else provides it, so prose on every other
 * surface (and in the standard interface) renders as it always has.
 */
export const ISSUE_INDEX: InjectionKey<Ref<Map<number, IssueIndexEntry>>> = Symbol('issue-index')

/**
 * A ticket id as a whole word: the project key in group 1, the card id in
 * group 2. Keys are 2 to 5 capitals (`POST /api/projects`), and card ids are
 * global, so the key only has to agree with the card's own project.
 */
export function issueIdPattern(): RegExp {
  return /\b([A-Z]{2,5})-(\d+)\b/g
}

/** The indexed issue a `KEY-42` names, if the viewer can read it and the key is its project's. */
export function resolveIssueRef(index: Map<number, IssueIndexEntry>, key: string, id: number): IssueIndexEntry | undefined {
  const entry = index.get(id)
  return entry && entry.project.key === key ? entry : undefined
}

/** The issue page of a ref or an index entry. */
export function issueRefPath(issue: { ticket?: string, id: number }, projectSlug: string): string {
  return `/projects/${projectSlug}/cards/${issue.ticket ?? issue.id}`
}

/**
 * What the tracker issue page reads of `GET /api/cards/:id` beyond what the
 * standard page already does: the card's place in its tree, its relations
 * and its milestone.
 */
export interface TrackerIssueCard {
  id: number
  projectId: string
  statusId: string
  priority: string | null
  milestoneId: string | null
  archivedAt: string | null
  role: string
  project: { id: string, name: string, slug: string, key: string } | null
  statuses: Array<{ id: string, name: string, color: string | null, category: StatusCategory, position: number }>
  parent: IssueRef | null
  children: IssueRef[]
  childProgress: IssueProgress
  relations: { blocks: IssueRef[], blockedBy: IssueRef[], relates: IssueRef[] }
  milestone: { id: string, name: string, targetDate?: string | null } | null
}

/**
 * What the tracker issue page refetches after a change that alters what the
 * card embeds (its parent, children, relations, milestone, archive state).
 * Only these merge: the card's own columns belong to the page's ordered
 * writes, and a refetch answered before a later edit committed would put the
 * old value back.
 */
export const TRACKER_EMBEDDED_FIELDS = ['parentId', 'parent', 'children', 'childProgress', 'relations', 'milestoneId', 'milestone', 'archivedAt'] as const

export function mergeEmbedded<T extends object>(current: T, fresh: Record<string, unknown>): T {
  const picked = Object.fromEntries(TRACKER_EMBEDDED_FIELDS.filter(k => k in fresh).map(k => [k, fresh[k]]))
  return { ...current, ...picked }
}

/**
 * Index entries for the issues a card points at (parent, children, relations),
 * which can sit in other projects: the page's index covers only its own
 * project, so these let a chip for a related issue elsewhere still resolve.
 * Hidden refs carry no key and stay out.
 */
export function refIndexEntries(refs: IssueRef[]): IssueIndexEntry[] {
  return refs.flatMap((r) => {
    if (r.hidden || !r.ticket || !r.projectId || !r.projectSlug || !r.status) return []
    const key = r.ticket.slice(0, r.ticket.lastIndexOf('-'))
    return [{
      id: r.id,
      ticket: r.ticket,
      title: r.title ?? '',
      projectId: r.projectId,
      parentId: null,
      status: { ...r.status, position: 0 },
      project: { id: r.projectId, name: '', slug: r.projectSlug, key, icon: null },
      assignee: null,
      childProgress: r.childProgress ?? null,
      archivedAt: r.archivedAt ?? null
    }]
  })
}
