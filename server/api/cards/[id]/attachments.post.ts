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

  // Persist the type we're willing to *serve*, not the one the client claimed. Keeping the
  // raw claim would leave a value in the DB that is unsafe to echo, and the next endpoint to
  // reach for `attachment.mimeType` would quietly reintroduce the XSS the download path just
  // stopped. Rows written before this behave correctly anyway — download re-derives.
  const mimeType = serveContentType(file.name)
  await storage.write(storageKey, buffer, mimeType)

  const attachment = db.insert(schema.attachments).values({
    cardId: card.id,
    projectId: card.projectId,
    storageKey,
    originalName: file.name,
    mimeType,
    size: file.size,
    uploadedById: user.id
  }).returning().get()

  // attachmentCount is a card face badge, so an upload is a view change.
  emitCardChange(card.id, card.projectId)

  setResponseStatus(event, 201)
  return attachment
})
