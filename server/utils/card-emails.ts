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

/**
 * Email the people an assignment or a mention concerns.
 *
 * Fire-and-forget: the card or comment is already saved, so a slow or failing
 * mail server must neither delay the response nor turn a successful save into an
 * error. Failures are logged, exactly like the project-invitation email.
 *
 * Recipients are re-checked against the project's members here, even though both
 * callers only produce members (assignees are validated, mentions resolve within
 * the project). Card content leaving the app by email is the one place where a
 * future caller forgetting that check would leak, so the guard sits at the exit.
 */
export function sendCardActivityEmails(params: {
  actorId: string
  actorName: string
  projectId: string
  cardId: number
  cardTitle: string
  assignedUserId?: string | null
  mentionedUserIds?: Iterable<string>
  /** Text the mention appeared in, for the excerpt. */
  mentionText?: string | null
  mentionSource?: 'description' | 'comment'
}): void {
  if (!isEmailEnabled()) return

  const planned = planCardEmails(params)
  if (!planned.length) return

  const project = db.select().from(schema.projects).where(eq(schema.projects.id, params.projectId)).get()
  if (!project) return

  const recipients = db.select({ id: schema.users.id, email: schema.users.email })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(and(
      eq(schema.projectMembers.projectId, params.projectId),
      inArray(schema.projectMembers.userId, planned.map(p => p.userId))
    ))
    .all()
  const emailById = new Map(recipients.map(r => [r.id, r.email]))

  const baseUrl = process.env.APP_URL || 'http://localhost:3000'
  const ticketId = `${project.key || 'TK'}-${params.cardId}`
  const cardUrl = `${baseUrl}/projects/${encodeURIComponent(project.slug)}/cards/${encodeURIComponent(ticketId)}`
  const common = {
    actorName: params.actorName,
    projectName: project.name,
    ticketId,
    cardTitle: params.cardTitle,
    cardUrl
  }

  for (const { userId, kind } of planned) {
    const to = emailById.get(userId)
    if (!to) continue // not (or no longer) a member — never email card content to them

    const email = kind === 'assigned'
      ? buildCardAssignedEmail(common)
      : buildMentionEmail({
          ...common,
          excerpt: mentionExcerpt(params.mentionText || ''),
          source: params.mentionSource ?? 'description'
        })

    sendBuiltEmail(to, email).catch((err) => {
      console.error(`Failed to send ${kind} email:`, (err as Error).message)
    })
  }
}
