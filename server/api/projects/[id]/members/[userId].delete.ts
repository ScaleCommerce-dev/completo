import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project, membership } = await resolveProject(event)
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'Agents cannot manage members' })
  }
  const userId = getRouterParam(event, 'userId')

  // Check if target is an owner and if they're the last one
  const targetMembership = db.select().from(schema.projectMembers)
    .where(and(
      eq(schema.projectMembers.projectId, project.id),
      eq(schema.projectMembers.userId, userId!)
    ))
    .get()

  const target = db.select({ kind: schema.users.kind, managedById: schema.users.managedById, isAdmin: schema.users.isAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, userId!))
    .get()

  // Project owners remove anyone. An agent's manager may also take their own agent
  // out of a project they are only a member of: managing it includes that.
  const isOwnAgent = target?.kind === 'agent' && target.managedById === user.id
  if (membership.role !== 'owner' && !isOwnAgent) {
    throw createError({ statusCode: 403, message: 'Only the project owner can perform this action' })
  }

  if (targetMembership?.role === 'owner') {
    const ownerCount = db.select().from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, project.id),
        eq(schema.projectMembers.role, 'owner')
      ))
      .all()
      .length

    if (ownerCount <= 1) {
      throw createError({ statusCode: 400, message: 'Cannot remove the last owner' })
    }
  }

  if (target?.kind === 'agent') {
    const unassignedCards = targetMembership ? removeFromProject(userId!, project.id, user) : 0
    return { ok: true, removedAgents: [], unassignedCards }
  }

  // Create notification BEFORE deletion (user loses access after)
  createNotification({
    userId: userId!,
    type: 'member_removed',
    title: 'Removed from project',
    message: `${user.name} removed you from ${project.name}`,
    projectId: project.id,
    actorId: user.id
  })

  // A person who can no longer open the project is unassigned from its cards, as an
  // agent is. An admin still reaches every project, so their cards stay theirs.
  let ownCards = 0
  if (target?.isAdmin) {
    db.delete(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, project.id),
        eq(schema.projectMembers.userId, userId!)
      ))
      .run()
  } else if (targetMembership) {
    ownCards = removeFromProject(userId!, project.id, user)
  }

  // The membership invariant: an agent is only in projects its manager is in, so
  // the agents this person manages leave with them. An admin's agents are the
  // exception, since an admin manager reaches every project anyway.
  const { agents, unassignedCards } = target && !target.isAdmin
    ? removeManagedAgentsFromProject(userId!, project.id, user)
    : { agents: [], unassignedCards: 0 }

  return { ok: true, removedAgents: agents, unassignedCards: ownCards + unassignedCards }
})
