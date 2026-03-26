export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBody(event)
  const card = createCard({
    projectId: project.id,
    userId: user.id,
    userName: user.name,
    body
  })
  setResponseStatus(event, 201)
  return card
})
