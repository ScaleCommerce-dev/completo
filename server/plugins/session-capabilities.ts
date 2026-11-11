import { eq } from 'drizzle-orm'

/**
 * `canManageAgents` on the client's session user, read fresh on every session fetch.
 *
 * The sidebar's Agents entry and the `/agents` route guard need to know whether
 * the signed-in person may create agents. The sealed session cookie cannot carry
 * that: it is written at sign-in, and the permission is granted and revoked by an
 * admin afterwards, so a cookie copy would leave someone who was just allowed
 * unable to find the page until they signed out and back in. This hook adds the
 * live value to what `/api/_auth/session` returns without writing it into the
 * cookie, so it is as fresh as the last page load. The server still decides every
 * request on its own (`requireAgentCreator`, `resolveManagedAgent`); this only
 * decides what the client offers.
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', (session) => {
    const user = session.user as { id?: string, canManageAgents?: boolean } | undefined
    if (!user?.id) return

    const row = db.select({
      kind: schema.users.kind,
      isAdmin: schema.users.isAdmin,
      canCreateAgents: schema.users.canCreateAgents,
      suspendedAt: schema.users.suspendedAt
    })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .get()

    user.canManageAgents = !!row && canManageAgents(row)
  })
})
