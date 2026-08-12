import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  // The `.unique()` above is case-sensitive (no COLLATE NOCASE), which let one person hold
  // two rows — `foo@x` and `Foo@x` — when an endpoint forgot to normalise. Every write path
  // now lowercases, and this makes the database refuse the mistake rather than trusting all
  // of them to keep remembering.
  uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)
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
