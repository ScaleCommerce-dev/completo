import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project, user } = await resolveProject(event, { auth: 'owner' })
  const { userId, email } = await readBody<{ userId?: string, email?: string }>(event)

  if (!userId && !email) {
    throw createError({ statusCode: 400, message: 'userId or email is required' })
  }

  // Try to find the user
  const targetUser = userId
    ? db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    : db.select().from(schema.users).where(eq(schema.users.email, email!)).get()

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
  if (!email) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw createError({ statusCode: 400, message: 'Invalid email format' })
  }

  // Check for existing pending invitation (same email + project)
  const existingInvitation = db.select()
    .from(schema.projectInvitations)
    .where(and(
      eq(schema.projectInvitations.projectId, project.id),
      eq(schema.projectInvitations.email, email.toLowerCase())
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
    email: email.toLowerCase(),
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
      await sendAccountInviteEmail(email, user.name, project.name, registerUrl)
    } catch (err) {
      console.error('Failed to send invitation email:', (err as Error).message)
    }
  }

  setResponseStatus(event, 201)
  return { added: true }
})
