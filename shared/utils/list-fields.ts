/**
 * Which card fields a list view can show as a column.
 *
 * Single source of truth. This was previously nine hardcoded arrays that never
 * referenced each other — two server allowlists, two sortable-field sets, two picker
 * option lists, and three default-column lists — so adding a field meant editing six of
 * them by hand with nothing to catch a miss. Two divergences had already crept in:
 *
 *   - `dueDate` was sortable in ListView but absent from the server's sortable set, so
 *     clicking the Due Date header sorted the rows and then failed to save with
 *     "Invalid sort field".
 *   - `done` was offered in ViewConfigModal but not CreateViewModal, so the checkbox
 *     column could only be added after a list existed.
 *
 * Both are gone by construction now. Adding a field means one entry here.
 *
 * `list_columns.field` / `my_tasks_columns.field` are plain text with no CHECK
 * constraint, so adding a field needs no migration — but every validator and picker
 * derives from this list, so they cannot fall out of step.
 */
export interface ListFieldDef {
  /** Stored in `list_columns.field` / `my_tasks_columns.field`. */
  field: string
  /** Full name, used by the column pickers. */
  label: string
  /** Terser name for the table header, where space is tight. Falls back to `label`. */
  shortLabel?: string
  icon: string
  /** Whether the table header sorts, and the server accepts it as a saved sortField. */
  sortable?: boolean
  /** Fixed column width. Omitted for `title`, which takes the remaining space. */
  width?: string
}

export const LIST_FIELDS: readonly ListFieldDef[] = [
  // `done` renders a checkmark icon in the header rather than text, hence the empty shortLabel.
  { field: 'done', label: 'Done', shortLabel: '', icon: 'i-lucide-circle-check-big', width: '44px' },
  { field: 'ticketId', label: 'Ticket ID', shortLabel: 'ID', icon: 'i-lucide-hash', sortable: true, width: '88px' },
  { field: 'title', label: 'Title', icon: 'i-lucide-type', sortable: true },
  { field: 'status', label: 'Status', icon: 'i-lucide-circle-dot', sortable: true, width: '130px' },
  { field: 'assignee', label: 'Assignee', icon: 'i-lucide-user', sortable: true, width: '148px' },
  { field: 'creator', label: 'Creator', icon: 'i-lucide-user-pen', sortable: true, width: '148px' },
  { field: 'priority', label: 'Priority', icon: 'i-lucide-signal', sortable: true, width: '104px' },
  { field: 'tags', label: 'Tags', icon: 'i-lucide-tag', width: '160px' },
  { field: 'dueDate', label: 'Due Date', icon: 'i-lucide-calendar', sortable: true, width: '120px' },
  { field: 'createdAt', label: 'Created', icon: 'i-lucide-calendar-plus', sortable: true, width: '100px' },
  { field: 'updatedAt', label: 'Updated', icon: 'i-lucide-calendar-clock', sortable: true, width: '100px' },
  { field: 'description', label: 'Description', icon: 'i-lucide-text', width: '200px' }
]

/** Every valid column field. Used by both column-add endpoints. */
export const LIST_FIELD_KEYS: readonly string[] = LIST_FIELDS.map(f => f.field)

/** Fields a view may be sorted by, client-side and as a persisted sortField. */
export const SORTABLE_LIST_FIELDS: ReadonlySet<string> = new Set(
  LIST_FIELDS.filter(f => f.sortable).map(f => f.field)
)

/** Table-header text, keyed by field. */
export const LIST_FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  LIST_FIELDS.map(f => [f.field, f.shortLabel ?? f.label])
)

export const LIST_FIELD_WIDTHS: Readonly<Record<string, string>> = Object.fromEntries(
  LIST_FIELDS.filter(f => f.width).map(f => [f.field, f.width!])
)

/**
 * Columns a newly created list starts with.
 *
 * **Title leads.** `ticketId` used to, which cost the row twice over: the first thing
 * read on every line was an identifier nobody was scanning for, and Title — the only
 * column that flexes — was pushed far enough right that it truncated ("Smoke test card
 * fr…") while fixed-width columns held their space. The ID is metadata for URLs, the CLI
 * and reading a ticket number out loud, so it goes last and stays quiet there.
 *
 * Existing lists keep their own column order; these two sets only seed new ones. A list
 * whose columns were arranged by hand is a deliberate choice, and silently rewriting it
 * would be worse than an unhelpful default.
 *
 * My Tasks deliberately differs: it only ever shows your own cards, so Assignee would be
 * a column of one repeated name, and a Done checkbox is more use there than on a shared
 * board view.
 */
export const LIST_DEFAULT_FIELDS: readonly string[] = ['title', 'status', 'priority', 'assignee', 'dueDate', 'tags', 'ticketId']
export const MY_TASKS_DEFAULT_FIELDS: readonly string[] = ['done', 'title', 'status', 'priority', 'dueDate', 'tags', 'ticketId']

export function isListField(value: unknown): value is string {
  return typeof value === 'string' && LIST_FIELD_KEYS.includes(value)
}
