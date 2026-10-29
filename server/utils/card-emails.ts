import { eq, and, inArray } from 'drizzle-orm'

export type CardEmailKind = 'assigned' | 'mentioned'

export interface PlannedCardEmail {
  userId: string
  kind: CardEmailKind
}

/**
 * Decide who gets which email for ONE action (a card create, a card edit, a
 * comment), so the rules live in one place and are testable without a server:
 *
 * - Nobody is emailed about their own action — assigning yourself or mentioning
 *   yourself sends nothing.
 * - One person gets at most one email per action. Being assigned AND mentioned in
 *   the same save is one "assigned" email, because the assignment is the stronger
 *   reason to open the card.
 *
 * "Only newly added mentions" is not decided here: callers pass the ids that
 * `notifyMentionedUsers` already narrowed to mentions absent from the old text,
 * so re-saving an unchanged mention never reaches this function.
 */
export function planCardEmails(params: {
  actorId: string
  assignedUserId?: string | null
  mentionedUserIds?: Iterable<string>
}): PlannedCardEmail[] {
  const planned = new Map<string, CardEmailKind>()
  if (params.assignedUserId && params.assignedUserId !== params.actorId) {
    planned.set(params.assignedUserId, 'assigned')
  }
  for (const userId of params.mentionedUserIds ?? []) {
    if (userId === params.actorId || planned.has(userId)) continue
    planned.set(userId, 'mentioned')
  }
  return [...planned].map(([userId, kind]) => ({ userId, kind }))
}

export const CARD_EMAIL_COOLDOWN_MS = 15 * 60 * 1000

/**
 * At most one email of a kind, per person, per card, per cooldown window.
 *
 * "Newly added mention" is computed against the previous text only, so adding
 * `@Bob`, saving, removing it and saving again re-qualifies Bob every cycle — and
 * so does toggling an assignee A→B→A. In-app notifications tolerate that; email is
 * more intrusive and costs sender reputation, so it is rate-limited here.
 *
 * In memory, not in the database: Completo is a single process on SQLite, the
 * window is minutes, and a restart forgetting it costs at most one extra email.
 * Persisting it would mean a table and a migration to guard against that.
 */
export function createCardEmailCooldown(windowMs = CARD_EMAIL_COOLDOWN_MS) {
  const lastSent = new Map<string, number>()
  return {
    /** True (and records the send) if this email may go out now. */
    take(userId: string, cardId: number, kind: CardEmailKind, now = Date.now()): boolean {
      if (lastSent.size > 5000) {
        for (const [key, at] of lastSent) if (now - at >= windowMs) lastSent.delete(key)
      }
      const key = `${userId}:${cardId}:${kind}`
      const at = lastSent.get(key)
      if (at !== undefined && now - at < windowMs) return false
      lastSent.set(key, now)
      return true
    }
  }
}

const cooldown = createCardEmailCooldown()

/**
 * Which planned recipients may actually be emailed, with their address.
 *
 * Re-checks project membership even though both callers only produce members
 * (assignees are validated, mentions resolve within the project): card content
 * leaving the app by email is the one place where a future caller forgetting that
 * check would leak, so the guard sits at the exit. Also drops anyone who turned
 * card emails off on their profile.
 */
export function resolveCardEmailRecipients(projectId: string, userIds: string[]): Map<string, string> {
  if (!userIds.length) return new Map()
  const rows = db.select({ id: schema.users.id, email: schema.users.email })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(and(
      eq(schema.projectMembers.projectId, projectId),
      inArray(schema.projectMembers.userId, userIds),
      eq(schema.users.emailNotifications, 1)
    ))
    .all()
  return new Map(rows.map(r => [r.id, r.email]))
}

/**
 * Test-only record of the card emails that would be sent, readable through
 * /api/_test/card-emails. Integration tests run with SMTP disabled, so without it
 * nothing would observe which call site emails whom. Only filled when
 * ALLOW_TEST_ENDPOINTS is set; production never touches it.
 */
export const cardEmailTestOutbox: Array<{ to: string, userId: string, kind: CardEmailKind, cardId: number, subject: string, text: string }> = []

/**
 * Email the people an assignment or a mention concerns.
 *
 * Fire-and-forget: the card or comment is already saved, so a slow or failing
 * mail server must neither delay the response nor turn a successful save into an
 * error. Failures are logged, exactly like the project-invitation email.
 */
export function sendCardActivityEmails(params: {
  actorId: string
  actorName: string
  project: { id: string, name: string, slug: string, key: string | null }
  cardId: number
  cardTitle: string
  assignedUserId?: string | null
  mentionedUserIds?: Iterable<string>
  /** Text the mention appeared in, for the excerpt. */
  mentionText?: string | null
  mentionSource?: 'description' | 'comment'
}): void {
  const testMode = !!process.env.ALLOW_TEST_ENDPOINTS
  if (!isEmailEnabled() && !testMode) return

  const planned = planCardEmails(params)
  if (!planned.length) return

  const recipients = resolveCardEmailRecipients(params.project.id, planned.map(p => p.userId))

  const ticketId = `${params.project.key || 'TK'}-${params.cardId}`
  const cardUrl = `${appBaseUrl()}/projects/${encodeURIComponent(params.project.slug)}/cards/${encodeURIComponent(ticketId)}`
  const common = {
    actorName: params.actorName,
    projectName: params.project.name,
    ticketId,
    cardTitle: params.cardTitle,
    cardUrl
  }

  for (const { userId, kind } of planned) {
    const to = recipients.get(userId)
    if (!to) continue // not a member, or opted out — never email card content to them
    if (!cooldown.take(userId, params.cardId, kind)) continue

    const email = kind === 'assigned'
      ? buildCardAssignedEmail(common)
      : buildMentionEmail({
          ...common,
          excerpt: mentionExcerpt(params.mentionText || '', { aroundUserId: userId }),
          source: params.mentionSource ?? 'description'
        })

    if (testMode) {
      cardEmailTestOutbox.push({ to, userId, kind, cardId: params.cardId, subject: email.subject, text: email.text })
    }
    if (!isEmailEnabled()) continue

    sendBuiltEmail(to, email).catch((err) => {
      console.error(`Failed to send ${kind} email:`, (err as Error).message)
    })
  }
}
