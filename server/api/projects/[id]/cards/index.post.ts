import { cardCreateSchema } from '#shared/schemas/card'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBodyAs(event, cardCreateSchema)
  const card = createCard({
    projectId: project.id,
    userId: user.id,
    userName: user.name,
    body
  })
  setResponseStatus(event, 201)
  return card
})
