import { eq, and } from 'drizzle-orm'

type NotificationType = 'card_assigned' | 'member_added' | 'role_changed' | 'member_removed' | 'mentioned'

export function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  message: string
  linkUrl?: string
  projectId?: string
  cardId?: number
  actorId?: string
}) {
  // Never notify yourself
  if (params.actorId && params.actorId === params.userId) return

  db.insert(schema.notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    linkUrl: params.linkUrl || null,
    projectId: params.projectId || null,
    cardId: params.cardId || null,
    actorId: params.actorId || null
  }).run()
}

function extractMentionedNames(text: string): string[] {
  const matches = text.matchAll(/@\[([^\]]+)\]/g)
  return [...new Set([...matches].map(m => m[1]!))]
}

export function notifyMentionedUsers(params: {
  description: string
  oldDescription?: string | null
  projectId: string
  cardId: number
  actorId: string
  actorName: string
  cardTitle: string
  projectSlug: string
  projectKey: string
}) {
  const newNames = extractMentionedNames(params.description)
  if (!newNames.length) return

  const oldNames = params.oldDescription ? new Set(extractMentionedNames(params.oldDescription)) : new Set<string>()
  const addedNames = newNames.filter(name => !oldNames.has(name))
  if (!addedNames.length) return

  const ticketId = `${params.projectKey}-${params.cardId}`
  const linkUrl = `/projects/${params.projectSlug}/cards/${ticketId}`

  for (const name of addedNames) {
    const member = db.select({ userId: schema.projectMembers.userId })
      .from(schema.projectMembers)
      .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
      .where(and(
        eq(schema.projectMembers.projectId, params.projectId),
        eq(schema.users.name, name)
      ))
      .get()

    if (member) {
      createNotification({
        userId: member.userId,
        type: 'mentioned',
        title: 'You were mentioned',
        message: `${params.actorName} mentioned you in ${ticketId}: ${params.cardTitle}`,
        linkUrl,
        projectId: params.projectId,
        cardId: params.cardId,
        actorId: params.actorId
      })
    }
  }
}
