import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, board } = await resolveBoard(event)

  db.delete(schema.boards).where(eq(schema.boards.id, board.id)).run()
  return { ok: true }
})
