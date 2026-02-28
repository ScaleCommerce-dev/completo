import spec from '../assets/openapi.json'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  return spec
})
