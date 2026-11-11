import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)

  const rows = db.select().from(schema.attachments)
    .leftJoin(schema.users, eq(schema.attachments.uploadedById, schema.users.id))
    .where(eq(schema.attachments.cardId, card.id))
    .all()

  // Who uploaded each file, so an agent's attachment reads as the agent's.
  const { ref } = createUserRefs(rows.map(r => r.users))
  return rows.map(r => ({ ...r.attachments, uploader: ref(r.users) }))
})
