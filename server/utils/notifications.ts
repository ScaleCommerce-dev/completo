import { eq, and, like, inArray } from 'drizzle-orm'

type NotificationType = 'card_assigned' | 'member_added' | 'role_changed' | 'member_removed' | 'mentioned' | 'comment_added'

interface NotificationContent {
  type: NotificationType
  title: string
  message: string
  linkUrl?: string
  projectId?: string
  cardId?: number
  actorId?: string
}

export function createNotification(params: NotificationContent & { userId: string }) {
  const { userId, ...content } = params
  createNotifications([userId], content)
}

/**
 * The same notification to several people: the one place a notification is
 * written, so the two rules below hold for every caller, and one query sorts out
 * the agents among the recipients however many there are.
 */
export function createNotifications(userIds: Iterable<string>, params: NotificationContent) {
  // Never notify yourself
  const ids = [...new Set(userIds)].filter(id => id !== params.actorId)
  if (!ids.length) return

  // Nor an agent: nobody reads its inbox, so its notifications would only pile up
  // unread. Agents are told nothing; the people around them are.
  const humans = db.select({ id: schema.users.id, isAdmin: schema.users.isAdmin }).from(schema.users)
    .where(and(inArray(schema.users.id, ids), eq(schema.users.kind, 'human')))
    .all()

  // Nor anyone who can no longer see the project. Callers derive recipients from
  // history — the assignee, earlier commenters — and removing a member touches
  // neither, so an ex-member kept getting a card title per new comment. Checked
  // here once rather than trusted to each caller. `member_removed` is the one
  // notification addressed to someone who has just left.
  let recipients = humans.map(r => r.id)
  if (params.projectId && params.type !== 'member_removed') {
    const members = new Set(db.select({ userId: schema.projectMembers.userId }).from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, params.projectId), inArray(schema.projectMembers.userId, recipients)))
      .all()
      .map(r => r.userId))
    recipients = humans.filter(r => r.isAdmin || members.has(r.id)).map(r => r.id)
  }

  for (const userId of recipients) {
    const row = db.insert(schema.notifications).values({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl || null,
      projectId: params.projectId || null,
      cardId: params.cardId || null,
      actorId: params.actorId || null
    }).returning().get()

    // Push it live to that user's notification stream, so the bell count and a
    // toast appear at once instead of on the next 30s poll. Payload is enough to
    // render the toast without a round-trip; the bell still refetches the count so
    // it stays authoritative if several land together.
    emitUserEvent(userId, 'notification', {
      id: row.id,
      notificationType: params.type,
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl || null
    })
  }
}

/**
 * Mentions are stored as `@[Display Name](ref)`, where `ref` is a prefix of the
 * user's UUID — the first group, 8 hex chars, e.g. `@[Ada Lovelace](2937d57e)`.
 * A full UUID is also accepted, since a full id is just a longer prefix.
 *
 * Why a prefix: the whole UUID made the raw markdown unreadable while editing, and
 * the editor is a plain textarea, so what is stored is what the author sees.
 * Resolution is scoped to one project's members, so 32 bits is ample — a collision
 * needs two members of the *same* project to share their first 8 hex chars (~1 in
 * 3.5 million at 50 members). If it ever happens, resolution is ambiguous and we
 * notify nobody rather than pick one; guessing is precisely the old bug below.
 *
 * Mentions used to be `@[Display Name]`, resolved with `eq(users.name, name)`.
 * `users.name` has no unique constraint, so two members could share a display name
 * and `.get()` returned an arbitrary row — the *wrong* user was notified, silently.
 * Renames broke resolution the same way. Mentions in that old format no longer
 * match, so they render as literal text and notify nobody. That is deliberate:
 * rewriting old names to ids would have to guess exactly where that bug lives.
 */
export function extractMentionedUserIds(text: string): string[] {
  const matches = text.matchAll(/@\[[^\]]+\]\(([^)\s]+)\)/g)
  return [...new Set([...matches].map(m => m[1]!))]
}

/**
 * A mention ref must look like a UUID or a prefix of one before it goes anywhere
 * near a LIKE pattern — `%` and `_` are wildcards there, and refs come from
 * author-controlled text. Anything else resolves to nobody.
 */
function isValidMentionRef(ref: string): boolean {
  return /^[0-9a-f]{6,8}$|^[0-9a-f-]{9,36}$/i.test(ref)
}

/**
 * Notify users mentioned in `text` but not in `oldText`, so editing does not
 * re-notify everyone. Returns the ids it notified, letting callers avoid sending a
 * second notification about the same event (see notifyCommentAdded).
 */
export function notifyMentionedUsers(params: {
  text: string
  oldText?: string | null
  projectId: string
  cardId: number
  actorId: string
  actorName: string
  cardTitle: string
  projectSlug: string
  projectKey: string
  /** Varies only the wording; a comment mention reads differently to a description one. */
  source?: 'description' | 'comment'
}): Set<string> {
  const notified = new Set<string>()

  const newIds = extractMentionedUserIds(params.text)
  if (!newIds.length) return notified

  const oldIds = params.oldText ? new Set(extractMentionedUserIds(params.oldText)) : new Set<string>()
  const addedIds = newIds.filter(id => !oldIds.has(id))
  if (!addedIds.length) return notified

  const ticketId = `${params.projectKey}-${params.cardId}`
  const linkUrl = `/projects/${params.projectSlug}/cards/${ticketId}`
  const where = params.source === 'comment' ? `in a comment on ${ticketId}` : `in ${ticketId}`

  for (const ref of addedIds) {
    if (!isValidMentionRef(ref)) continue

    // Scoped to project members, so mentioning a non-member notifies nobody.
    const matches = db.select({ userId: schema.projectMembers.userId })
      .from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, params.projectId),
        like(schema.projectMembers.userId, `${ref}%`)
      ))
      .all()

    // Exactly one, or nobody. An ambiguous prefix must never resolve to a guess.
    if (matches.length !== 1) continue
    notified.add(matches[0]!.userId)
  }

  createNotifications(notified, {
    type: 'mentioned',
    title: 'You were mentioned',
    message: `${params.actorName} mentioned you ${where}: ${params.cardTitle}`,
    linkUrl,
    projectId: params.projectId,
    cardId: params.cardId,
    actorId: params.actorId
  })

  return notified
}

/**
 * Notify mentioned users plus the card assignee about a new or edited comment.
 * The assignee is skipped when they were already mentioned, so one comment never
 * produces two notifications for the same person. Self-notification is prevented
 * inside createNotification.
 */
export function notifyCommentActivity(params: {
  body: string
  oldBody?: string | null
  projectId: string
  cardId: number
  cardTitle: string
  assigneeId?: string | null
  actorId: string
  actorName: string
  projectName: string
  projectSlug: string
  projectKey: string
  /** Only a newly created comment notifies the assignee; an edit just notifies new mentions. */
  isNew: boolean
}) {
  const mentioned = notifyMentionedUsers({
    text: params.body,
    oldText: params.oldBody,
    projectId: params.projectId,
    cardId: params.cardId,
    actorId: params.actorId,
    actorName: params.actorName,
    cardTitle: params.cardTitle,
    projectSlug: params.projectSlug,
    projectKey: params.projectKey,
    source: 'comment'
  })

  // Mentions also go out by email; `mentioned` already holds only the newly added
  // ones, so editing a comment does not re-mail anyone. A plain new comment is
  // in-app only — email is reserved for being assigned or addressed directly.
  sendCardActivityEmails({
    actorId: params.actorId,
    actorName: params.actorName,
    project: { id: params.projectId, name: params.projectName, slug: params.projectSlug, key: params.projectKey },
    cardId: params.cardId,
    cardTitle: params.cardTitle,
    mentionedUserIds: mentioned,
    mentionText: params.body,
    mentionSource: 'comment'
  })

  // Editing a comment only notifies its newly added mentions (handled above);
  // it must not re-ping the thread.
  if (!params.isNew) return

  // Everyone with a stake in the thread hears about a new comment: the assignee,
  // plus anyone who has previously commented on this card (thread participants).
  // A person already told via a mention is skipped so one comment is one
  // notification per person, and the actor is skipped inside createNotification.
  const recipients = new Set<string>()
  if (params.assigneeId) recipients.add(params.assigneeId)
  for (const row of db.select({ authorId: schema.comments.authorId })
    .from(schema.comments)
    .where(eq(schema.comments.cardId, params.cardId))
    .all()) {
    if (row.authorId) recipients.add(row.authorId)
  }

  const ticketId = `${params.projectKey}-${params.cardId}`
  createNotifications([...recipients].filter(userId => !mentioned.has(userId)), {
    type: 'comment_added',
    title: 'New comment',
    message: `${params.actorName} commented on ${ticketId}: ${params.cardTitle}`,
    linkUrl: `/projects/${params.projectSlug}/cards/${ticketId}`,
    projectId: params.projectId,
    cardId: params.cardId,
    actorId: params.actorId
  })
}
