export default defineEventHandler((event) => {
  allowCrossOrigin(event)
  return authorizationServerMetadata(event)
})
