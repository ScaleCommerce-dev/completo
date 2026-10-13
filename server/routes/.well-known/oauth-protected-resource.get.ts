export default defineEventHandler((event) => {
  allowCrossOrigin(event)
  return protectedResourceMetadata(event)
})
