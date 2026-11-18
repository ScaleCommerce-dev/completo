import type { InjectionKey } from 'vue'

/**
 * Pasting a screenshot straight into the description or a comment.
 *
 * The editors cannot upload by themselves: the card may not exist yet (create
 * mode), and the code that makes a draft card for an upload lives with the
 * attachment list. So the card surface provides an uploader and the editors
 * inject it. An editor mounted anywhere else simply finds none and leaves the
 * paste to the browser.
 */
export interface PastedImage { alt: string, src: string }
export type PasteImageUploader = (file: File) => Promise<PastedImage | null>
export const PASTE_IMAGE_UPLOADER: InjectionKey<PasteImageUploader> = Symbol('paste-image-uploader')

/** What a card surface exposes from its `AttachmentList`. */
export interface AttachmentListHandle {
  uploadFiles: (files: File[]) => Promise<void>
  uploadImage: (file: File) => Promise<{ id: string, originalName: string } | null>
}

/**
 * The image files a paste carries, or none when it is really text.
 *
 * Office apps put a rendered picture of the selection on the clipboard *beside*
 * the text: copying three spreadsheet cells offers `text/plain` and an
 * `image/png`. Plain text present therefore means the user copied text, and the
 * picture is left alone. A screenshot, or an image copied from a browser, has no
 * plain text, only the file (and from a browser some HTML wrapping it).
 */
export function pastedImageFiles(data: DataTransfer | null | undefined): File[] {
  if (!data?.files?.length) return []
  if (data.getData('text/plain')) return []
  return [...data.files].filter(file => file.type.startsWith('image/'))
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp'
}

/**
 * Browsers name every pasted screenshot `image.png`, so a card with three of them
 * listed three identical attachments. A generic or missing name becomes a
 * timestamped one; a real file name copied from Finder is kept.
 */
export function namePastedImage(file: File, now = new Date()): File {
  const generic = !file.name || /^image\.[a-z0-9]+$/i.test(file.name)
  if (!generic) return file

  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const ext = EXTENSIONS[file.type] ?? file.name.split('.').pop() ?? 'png'
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type })
}
