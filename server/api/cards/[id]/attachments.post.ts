export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)

  const formData = await readFormData(event)
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    throw createError({ statusCode: 400, message: 'No file provided' })
  }

  if (file.size > UPLOAD_MAX_SIZE_BYTES) {
    throw createError({ statusCode: 413, message: `File too large. Maximum size is ${UPLOAD_MAX_SIZE_MB}MB` })
  }

  if (!isAllowedMimeType(file.type, file.name)) {
    throw createError({ statusCode: 415, message: 'File type not allowed' })
  }

  const storageKey = generateStorageKey(file.name)
  const buffer = Buffer.from(await file.arrayBuffer())
  await storage.write(storageKey, buffer, file.type)

  const attachment = db.insert(schema.attachments).values({
    cardId: card.id,
    projectId: card.projectId,
    storageKey,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedById: user.id
  }).returning().get()

  setResponseStatus(event, 201)
  return attachment
})
