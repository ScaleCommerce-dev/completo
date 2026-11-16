import { eq } from 'drizzle-orm'

// Test-only: backdate a registered OAuth client, which is what pruning measures.
// Registration stamps the current time, so this is the only way a test can produce
// a registration old enough to prune.
export default defineEventHandler(async (event) => {
  requireTestEndpoints()
  const { clientId, daysAgo } = await readBody<{ clientId: string, daysAgo: number }>(event)
  if (typeof clientId !== 'string' || typeof daysAgo !== 'number') {
    throw createError({ statusCode: 400, message: 'clientId and daysAgo are required' })
  }
  db.update(schema.oauthClients)
    .set({ createdAt: new Date(Date.now() - daysAgo * 86400000) })
    .where(eq(schema.oauthClients.id, clientId))
    .run()
  return { ok: true }
})
