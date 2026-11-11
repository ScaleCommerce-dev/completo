import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { CARD_HISTORY_FIELDS } from '../../shared/utils/card-history-fields'

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  colorMode: text('color_mode'),
  isAdmin: integer('is_admin').notNull().default(0),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  // Opt-out for card-activity emails (assigned / mentioned). On by default, so
  // existing users start receiving them; the profile page turns them off.
  emailNotifications: integer('email_notifications').notNull().default(1),
  // An agent is an account for an AI tool: it acts only through API tokens, its
  // password hash is the unhashable '!agent' and its address is a synthetic
  // `@agents.invalid` one that is never mailed or returned (see server/utils/agents.ts).
  // Type-level only, like notifications.type: plain text in SQLite.
  kind: text('kind', { enum: ['human', 'agent'] }).notNull().default('human'),
  // The human responsible for an agent. Null on an agent whose manager was deleted;
  // such an agent stays suspended until an admin transfers it. Always null on people.
  managedById: text('managed_by_id').references((): AnySQLiteColumn => users.id, { onDelete: 'set null' }),
  // Lets a non-admin create and manage agents. Admins can regardless.
  canCreateAgents: integer('can_create_agents').notNull().default(0),
  // Shown where a person shows an email address. Agents only.
  description: text('description'),
  // The avatar tint an agent's creator picked; people keep the hashed identityColor.
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  // The `.unique()` above is case-sensitive (no COLLATE NOCASE), which let one person hold
  // two rows — `foo@x` and `Foo@x` — when an endpoint forgot to normalise. Every write path
  // now lowercases, and this makes the database refuse the mistake rather than trusting all
  // of them to keep remembering.
  uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),
  // The MCP layer resolves an assignee by name, so two agents called "Claude" would make
  // "assign it to Claude" ambiguous. People may share names; agents may not.
  uniqueIndex('users_agent_name_lower_unique').on(sql`lower(${table.name})`).where(sql`${table.kind} = 'agent'`)
])

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  key: text('key').notNull().unique(),
  description: text('description'),
  briefing: text('briefing'),
  icon: text('icon'),
  doneStatusId: text('done_status_id').references((): AnySQLiteColumn => statuses.id, { onDelete: 'set null' }),
  doneRetentionDays: integer('done_retention_days'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const projectMembers = sqliteTable('project_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member')
})

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().default(''),
  position: integer('position').notNull().default(0),
  tagFilters: text('tag_filters'),
  statusFilters: text('status_filters'),
  assigneeFilters: text('assignee_filters'),
  priorityFilters: text('priority_filters'),
  // JSON array of `CARD_FIELDS` keys the board's cards do *not* paint at rest —
  // see `shared/utils/card-fields.ts` for why it stores the off set rather than
  // the on set. `null` means nothing is hidden. Parsed by the board GET beside
  // the filter JSON.
  hiddenCardFields: text('hidden_card_fields'),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const statuses = sqliteTable('statuses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references((): AnySQLiteColumn => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color')
})

export const boardColumns = sqliteTable('board_columns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  statusId: text('status_id').notNull().references(() => statuses.id, { onDelete: 'cascade' }),
  position: integer('position').notNull()
})

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().default(''),
  position: integer('position').notNull().default(0),
  sortField: text('sort_field'),
  sortDirection: text('sort_direction'),
  tagFilters: text('tag_filters'),
  statusFilters: text('status_filters'),
  assigneeFilters: text('assignee_filters'),
  priorityFilters: text('priority_filters'),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const listColumns = sqliteTable('list_columns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  position: integer('position').notNull()
})

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  statusId: text('status_id').notNull().references(() => statuses.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  position: integer('position').notNull(),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1')
})

export const cardTags = sqliteTable('card_tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' })
})

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  uploadedById: text('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // A comment belongs to a card, and the card owns the project relationship. No
  // denormalised projectId here on purpose: it would be a second source of truth
  // for permission checks, and would silently authorise against a stale project
  // if a card ever moved between projects. Resolve it through the card instead.
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  // Keep the comment when its author is deleted; the UI falls back to a placeholder.
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// A card's change history: one row per change, never merged, written by
// `recordCardEvents` (server/utils/card-history.ts) on every path that changes a
// recorded field; `tests/unit/card-history-recording.test.ts` derives those
// paths. The card's creation is not a row: it is read off `cards.createdAt` and
// `createdById`, so there is one source for it.
//
// No projectId, for the reason `comments` gives: access goes through the card.
export const cardEvents = sqliteTable('card_events', {
  // An integer, unlike every other table but `cards`, because it is the order:
  // milliseconds still tie inside one request (a save that changes three fields)
  // and a wall clock can step backwards, so insert order is what sequences a
  // burst, and the history endpoint pages on it.
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  // Kept when the account is deleted; `actorName` still says who it was.
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(),
  // Type-level only, like notifications.type: plain text in SQLite, so adding a
  // value needs no migration. The list is `shared/utils/card-history-fields.ts`.
  field: text('field', { enum: CARD_HISTORY_FIELDS }).notNull(),
  // Each side is the referenced row's id (status, user, tag, attachment) and its
  // name at the time, or just the value (priority, title, due date as ISO). The
  // name is the fallback for a row deleted since; a live row is read by its
  // current name. A null side is "none": unassigned, no due date, tag not on the
  // card. `description` records that it changed and never the text.
  fromId: text('from_id'),
  fromValue: text('from_value'),
  toId: text('to_id'),
  toValue: text('to_value'),
  // Milliseconds: whole seconds cannot tell a burst apart.
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
}, table => [
  index('card_events_card_id_idx').on(table.cardId, table.id)
])

export const aiSkills = sqliteTable('ai_skills', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  // Which editor offers the skill. Type-level only: SQLite stores this as plain
  // text with no CHECK constraint, so adding a value here needs no migration.
  scope: text('scope', { enum: ['card', 'board', 'comment'] }).notNull().default('card'),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const myTasksColumns = sqliteTable('my_tasks_columns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  position: integer('position').notNull()
})

export const myTasksCollapsed = sqliteTable('my_tasks_collapsed', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' })
})

export const globalSettings = sqliteTable('global_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  // What the token may be redeemed for. Three separate flows share this table, and without
  // this column each consumer accepted *any* live row: an emailed "verify your address" token
  // could be POSTed to /auth/reset-password to set an attacker-chosen password, which also
  // signs in — so read access to one message was full account takeover. Type-level only,
  // like notifications.type: plain text in SQLite, so a new value needs no migration.
  purpose: text('purpose', { enum: ['verify', 'reset', 'setup'] }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Type-level only: SQLite stores this as plain text with no CHECK constraint,
  // so adding a value here needs no migration.
  type: text('type', { enum: ['card_assigned', 'member_added', 'role_changed', 'member_removed', 'mentioned', 'comment_added'] }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  linkUrl: text('link_url'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').references(() => cards.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  readAt: integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

export const projectInvitations = sqliteTable('project_invitations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  invitedById: text('invited_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// When a user last read a card's comments — the state behind the "unread activity"
// dot on a card. One row per (user, card), stamped whenever the user fetches a
// card's comment list. A card reads as unread for a user when it has a comment
// newer than this timestamp that they did not write; with no row, everything not
// authored by them counts as unread. Deliberately per-user and separate from
// `notifications`: a notification is a one-off event that gets cleared, whereas
// this is durable "have I seen this card's discussion" state that has to survive
// the notification being dismissed.
export const cardReads = sqliteTable('card_reads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: integer('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  lastReadAt: integer('last_read_at', { mode: 'timestamp' }).notNull()
}, table => [
  // The upsert target: one read-state row per user per card. Mirrors the users
  // table's use of a unique index rather than a composite PK, keeping the uuid
  // `id` every other table has.
  uniqueIndex('card_reads_user_card_unique').on(table.userId, table.cardId)
])

// The projects a person keeps in their sidebar. Only members may star, and a
// row outlives a membership on purpose: `starred` is computed against current
// membership on every read (`/api/projects`, `/api/projects/[id]`), so a person
// removed from a project loses it from the sidebar without every removal path —
// member delete, agent pruning, transfers — having to remember this table.
export const projectStars = sqliteTable('project_stars', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  uniqueIndex('project_stars_user_project_unique').on(table.userId, table.projectId)
])

// ─── OAuth for MCP clients ───────────────────────────────────────────────────
//
// Completo is an OAuth 2.1 authorization server for exactly one resource: its
// own MCP endpoint. A Team-plan Claude connector is added once by an owner and
// every member signs in with their own account, so each member's calls carry
// their own identity — which a shared API token in a request header cannot
// give. The three tables below are the whole state: who may ask (clients),
// a ten-minute code between consent and token (codes), and the live
// access/refresh pair per sign-in (grants). Raw tokens are never stored; the
// columns hold SHA-256 hashes, as `api_tokens` does.

// Clients registered through the dynamic registration endpoint. A client that
// identifies itself by a metadata URL (Claude's "published identity") has no
// row here — it is fetched and validated on use — so grants and codes reference
// clients by id string without a foreign key.
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** JSON array of exact redirect URIs. */
  redirectUris: text('redirect_uris').notNull(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
  clientSecretHash: text('client_secret_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Issued by consent, spent by the token endpoint: the row is deleted on first
// read, so a replayed code is simply unknown.
export const oauthCodes = sqliteTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  resource: text('resource'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// One row per sign-in, rotated in place on refresh. This is what the profile
// page lists as a connected app and what revoking deletes.
export const oauthGrants = sqliteTable('oauth_grants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  accessTokenHash: text('access_token_hash').notNull().unique(),
  accessExpiresAt: integer('access_expires_at', { mode: 'timestamp' }).notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  refreshExpiresAt: integer('refresh_expires_at', { mode: 'timestamp' }).notNull(),
  resource: text('resource'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})
