import { eq, and } from 'drizzle-orm'

/**
 * Claim all pending project invitations for an email address.
 * Adds the user as a member to each invited project (skipping if already a member),
 * then deletes ALL invitations for this email (including expired ones).
 * Returns the number of projects the user was newly added to.
 */
export function claimProjectInvitations(email: string, userId: string): number {
  const now = new Date()

  // Find all non-expired invitations for this email (case-insensitive)
  const invitations = db.select()
    .from(schema.projectInvitations)
    .all()
    .filter(inv => inv.email.toLowerCase() === email.toLowerCase() && inv.expiresAt > now)

  let claimed = 0
  for (const inv of invitations) {
    // Check if already a member
    const existing = db.select()
      .from(schema.projectMembers)
      .where(and(
        eq(schema.projectMembers.projectId, inv.projectId),
        eq(schema.projectMembers.userId, userId)
      ))
      .get()

    if (!existing) {
      db.insert(schema.projectMembers).values({
        projectId: inv.projectId,
        userId,
        role: inv.role
      }).run()
      claimed++
    }
  }

  // Delete ALL invitations for this email (including expired)
  const allInvitations = db.select()
    .from(schema.projectInvitations)
    .all()
    .filter(inv => inv.email.toLowerCase() === email.toLowerCase())

  for (const inv of allInvitations) {
    db.delete(schema.projectInvitations)
      .where(eq(schema.projectInvitations.id, inv.id))
      .run()
  }

  return claimed
}
