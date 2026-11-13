/**
 * What a card's history records, one value per kind of change.
 *
 * Single source: the `card_events.field` column's enum (schema.ts), the server's
 * recorder and the panel's sentences all take it from here, so the panel's
 * `describeChange` switch is checked for exhaustiveness against the list the
 * database actually stores. Like `ai-skills.ts`, the column is plain text with
 * no CHECK constraint, so adding a value needs no migration; it does need a
 * sentence in `app/utils/card-history.ts` and a home in
 * `tests/unit/card-history-recording.test.ts`, and both fail until it has one.
 *
 * `created` is not here: the creation is read off the card, never stored.
 */
export const CARD_HISTORY_FIELDS = [
  'status', 'assignee', 'priority', 'dueDate', 'title', 'description', 'tag', 'attachment',
  // Sub-issues, milestones, relations and the archive. A side that names
  // another card carries its id and `KEY-<id>` as the value, never its title:
  // the history outlives access to that card's project.
  'parent', 'milestone', 'blocks', 'blockedBy', 'relates', 'archived'
] as const

export type CardHistoryField = typeof CARD_HISTORY_FIELDS[number]
