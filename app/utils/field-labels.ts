/**
 * The accessible name of a field trigger, for the four fields that share
 * `FieldMenu` plus the due date.
 *
 * These used to live in the menu components and reach the call site through
 * their default slot — one definition per field, next to the menu that owns the
 * field, because written at each call site they had already drifted: an unset
 * status read "none" in the card panel and "Set a status" in the list.
 *
 * They moved out here when the board card stopped mounting its menus up front
 * (see `armed` in `KanbanCard`). A label that only exists once the menu is
 * instantiated is not available to the plain button standing in for it, and a
 * trigger with no accessible name until you hover it is worse than the render
 * cost the lazy mount was buying back. Still one definition per field — the
 * menus read it from here and keep handing the same string to their slot, so no
 * call site had to change.
 */

export function tagsFieldLabel(
  tags: Array<{ id: string, name: string }>,
  selectedIds: string[]
): string {
  const names = tags.filter(t => selectedIds.includes(t.id)).map(t => t.name)
  return names.length ? `Tags: ${names.join(', ')}. Change tags` : 'Add tags'
}

export function priorityFieldLabel(priority?: string | null): string {
  return `Priority: ${priorityLabel(priority || 'medium')}. Change priority`
}

export function assigneeFieldLabel(
  members: Array<{ id: string, name: string }> | undefined,
  assigneeId?: string | null
): string {
  const selected = (members || []).find(m => m.id === assigneeId)
  return selected ? `Assigned to ${selected.name}. Change assignee` : 'Assign someone'
}

export function statusFieldLabel(
  statuses: Array<{ id: string, name: string }>,
  statusId?: string | null
): string {
  const selected = statuses.find(s => s.id === statusId)
  return selected ? `Status: ${selected.name}. Change status` : 'Set a status'
}

export function dueDateFieldLabel(dueDate?: string | null): string {
  return dueDate ? `Due ${formatDueDate(dueDate)}. Change due date` : 'Set a due date'
}
