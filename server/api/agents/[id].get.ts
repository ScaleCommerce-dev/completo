export default defineEventHandler(async (event) => {
  const { agent } = await resolveManagedAgent(event)
  return describeAgent(agent)
})
