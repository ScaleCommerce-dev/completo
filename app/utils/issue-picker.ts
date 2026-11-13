import { CLOSED_CATEGORIES } from '../../shared/utils/workflow'
import type { IssueRow } from './issue-list'

/**
 * What the relation picker does with what was typed.
 *
 * - `suggest`: nothing typed yet, so it offers the card's own project.
 * - `project`: a project key, alone or with its dash (`tk`, `TK-`), or with the
 *   start of a number (`TK-4`), lists that project's issues. Upstream's card
 *   search reads `tk-` as title text and finds nothing, and someone typing a
 *   key wants to browse that project rather than match a title.
 * - `search`: anything else goes to the app's card search unchanged.
 */
export type PickerQuery
  = | { kind: 'suggest' }
    | { kind: 'project', projectId: string, numberPrefix: string }
    | { kind: 'search', q: string }

/** Up to this many suggestions; the card search returns ten as well. */
export const PICKER_SUGGESTIONS = 10

export function classifyPickerTerm(term: string, projects: ReadonlyArray<{ id: string, key: string }>): PickerQuery {
  const q = term.trim()
  if (!q) return { kind: 'suggest' }

  const match = q.match(/^([A-Za-z]+)(?:-(\d*))?$/)
  if (match) {
    const key = match[1]!.toUpperCase()
    const project = projects.find(p => p.key.toUpperCase() === key)
    if (project) return { kind: 'project', projectId: project.id, numberPrefix: match[2] ?? '' }
  }

  return { kind: 'search', q }
}

/**
 * The issues a picker offers from one project: open ones (backlog included,
 * closed categories out), not excluded, whose number starts with the typed
 * digits, most recently updated first.
 */
export function pickerSuggestions(
  issues: readonly IssueRow[],
  options: { exclude?: readonly number[], numberPrefix?: string, limit?: number } = {}
): IssueRow[] {
  const { exclude = [], numberPrefix = '', limit = PICKER_SUGGESTIONS } = options
  return issues
    .filter(i => !CLOSED_CATEGORIES.includes(i.status.category))
    .filter(i => !exclude.includes(i.id))
    .filter(i => !numberPrefix || String(i.id).startsWith(numberPrefix))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}
