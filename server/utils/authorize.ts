import { eq, and } from 'drizzle-orm'

interface AuthOptions {
  isAdmin?: boolean
}

export function requireProjectMember(projectId: string, userId: string, options?: AuthOptions) {
  if (options?.isAdmin) {
    return { id: 'admin', projectId, userId, role: 'owner' as const }
  }

  const membership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId)
    )).get()

  if (!membership) {
    throw createError({ statusCode: 403, message: 'You are not a member of this project' })
  }

  return membership
}

export function requireBoardColumnAccess(board: { id: string, projectId: string, createdById: string | null }, userId: string, options?: AuthOptions) {
  if (options?.isAdmin) return
  if (board.createdById === userId) return

  const membership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, board.projectId),
      eq(schema.projectMembers.userId, userId),
      eq(schema.projectMembers.role, 'owner')
    )).get()

  if (membership) return

  throw createError({ statusCode: 403, message: 'Only the board owner or project owner can configure columns' })
}

export function requireListColumnAccess(list: { id: string, projectId: string, createdById: string | null }, userId: string, options?: AuthOptions) {
  if (options?.isAdmin) return
  if (list.createdById === userId) return

  const membership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, list.projectId),
      eq(schema.projectMembers.userId, userId),
      eq(schema.projectMembers.role, 'owner')
    )).get()

  if (membership) return

  throw createError({ statusCode: 403, message: 'Only the list owner or project owner can configure columns' })
}

export function requireProjectOwner(projectId: string, userId: string, options?: AuthOptions) {
  if (options?.isAdmin) {
    return { id: 'admin', projectId, userId, role: 'owner' as const }
  }

  const membership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.projectMembers.userId, userId),
      eq(schema.projectMembers.role, 'owner')
    )).get()

  if (!membership) {
    throw createError({ statusCode: 403, message: 'Only the project owner can perform this action' })
  }

  return membership
}
