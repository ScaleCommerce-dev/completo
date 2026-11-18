/**
 * Called once by each card surface (the panel and the card page), so an image
 * pasted into its description or a comment is stored through the same list a
 * drop goes to: it shows up there, and a create-mode paste makes the draft card
 * first. The editors inject what this provides; see `utils/pasted-images.ts`.
 */
export function providePasteImageUploader(list: Ref<AttachmentListHandle | null>, enabled: () => boolean = () => true) {
  provide(PASTE_IMAGE_UPLOADER, async (file) => {
    if (!enabled()) return null
    const attachment = await list.value?.uploadImage(file)
    return attachment ? { alt: attachment.originalName, src: `/api/attachments/${attachment.id}/download` } : null
  })
}
