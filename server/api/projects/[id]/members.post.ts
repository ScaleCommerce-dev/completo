import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project, user } = await resolveProject(event, { auth: 'owner' })
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'Agents cannot manage members' })
  }
  const { userId, email } = await readBody<{ userId?: string, email?: string }>(event)

  if (!userId && !email) {
    throw createError({ statusCode: 400, message: 'userId or email is required' })
  }

  // Every stored address is lowercased (migration 0004), so an un-normalised lookup can
  // never match a mixed-case input — `Owner@Acme.com` used to fall straight through to the
  // invitation branch below, and that invite is then unclaimable: claimProjectInvitations
  // only runs on register/setup-account, which an already-registered user never reaches.
  const normalizedEmail = email?.trim().toLowerCase()

  // Try to find the user
  const found = userId
    ? db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    : db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail!)).get()

  // An unverified self-registration is not yet anyone's account — its password was set
  // by whoever registered first, and the address's real owner may still replace it
  // (register.post.ts). Attaching it would hand this project to that first caller once
  // the owner verifies. By email it becomes an invitation, claimed at verification;
  // by id there is no address to invite, so it is not found. An admin-created account
  // pending setup is different: an admin vouched for it and nobody chose its password.
  const unverified = found && found.kind === 'human' && !found.emailVerifiedAt && !isPendingSetup(found)
  const targetUser = unverified ? undefined : found

  // User found — add directly
  if (targetUser) {
    const existing = db.select().from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, project.id),
        eq(schema.projectMembers.userId, targetUser.id)
      )).get()

    if (existing) {
      throw createError({ statusCode: 409, message: 'User is already a member' })
    }

    // The membership invariant: an agent joins only a project its manager is in
    // (an admin's agents: any). Its role is always member, it is never mailed and
    // never notified, so it takes none of the branches below.
    if (targetUser.kind === 'agent') {
      if (targetUser.suspendedAt) {
        throw createError({ statusCode: 400, message: 'A suspended agent cannot be added to a project' })
      }
      const manager = targetUser.managedById ? loadUserRow(targetUser.managedById) : null
      if (!agentMayJoinProject(manager ?? null, !!manager && isProjectMember(project.id, manager.id))) {
        throw createError({ statusCode: 403, message: 'An agent can only join projects its manager is a member of' })
      }
      db.insert(schema.projectMembers).values({
        projectId: project.id,
        userId: targetUser.id,
        role: 'member'
      }).run()
      setResponseStatus(event, 201)
      return { added: true }
    }

    db.insert(schema.projectMembers).values({
      projectId: project.id,
      userId: targetUser.id,
      role: 'member'
    }).run()

    // Send notification email
    if (isEmailEnabled()) {
      try {
        await sendProjectNotificationEmail(targetUser.email, user.name, project.name, project.slug)
      } catch (err) {
        console.error('Failed to send project notification email:', (err as Error).message)
      }
    }

    // In-app notification
    createNotification({
      userId: targetUser.id,
      type: 'member_added',
      title: 'Added to project',
      message: `${user.name} added you to ${project.name}`,
      linkUrl: `/projects/${project.slug}`,
      projectId: project.id,
      actorId: user.id
    })

    // Uniform response shape — don't reveal whether user existed
    setResponseStatus(event, 201)
    return { added: true }
  }

  // User not found — create invitation if email provided
  if (!normalizedEmail) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalizedEmail)) {
    throw createError({ statusCode: 400, message: 'Invalid email format' })
  }

  // Check for existing pending invitation (same email + project)
  const existingInvitation = db.select()
    .from(schema.projectInvitations)
    .where(and(
      eq(schema.projectInvitations.projectId, project.id),
      eq(schema.projectInvitations.email, normalizedEmail)
    ))
    .all()
    .find(inv => inv.expiresAt > new Date())

  if (existingInvitation) {
    throw createError({ statusCode: 409, message: 'An invitation has already been sent to this email' })
  }

  // Create invitation
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  db.insert(schema.projectInvitations).values({
    email: normalizedEmail,
    projectId: project.id,
    invitedById: user.id,
    token,
    expiresAt
  }).run()

  // Send invitation email
  if (isEmailEnabled()) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000'
    const registerUrl = `${baseUrl}/register?invitation=${token}`
    try {
      await sendAccountInviteEmail(normalizedEmail, user.name, project.name, registerUrl)
    } catch (err) {
      console.error('Failed to send invitation email:', (err as Error).message)
    }
  }

  setResponseStatus(event, 201)
  return { added: true }
})
