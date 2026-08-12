import { resolve, extname } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'

export interface StorageAdapter {
  write(key: string, data: Buffer, mimeType: string): Promise<void>
  read(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
}

class LocalStorageAdapter implements StorageAdapter {
  private dir: string
  private initialized = false

  constructor(dir: string) {
    this.dir = dir
  }

  private ensureDir() {
    if (!this.initialized) {
      mkdirSync(this.dir, { recursive: true })
      this.initialized = true
    }
  }

  private safePath(key: string): string {
    const fullPath = resolve(this.dir, key)
    if (!fullPath.startsWith(resolve(this.dir) + '/')) {
      throw new Error('Invalid storage key')
    }
    return fullPath
  }

  async write(key: string, data: Buffer): Promise<void> {
    this.ensureDir()
    writeFileSync(this.safePath(key), data)
  }

  async read(key: string): Promise<Buffer | null> {
    const path = this.safePath(key)
    if (!existsSync(path)) return null
    return readFileSync(path)
  }

  async delete(key: string): Promise<void> {
    const path = this.safePath(key)
    if (existsSync(path)) unlinkSync(path)
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key)
    }
  }
}

const uploadDir = resolve(process.env.UPLOAD_DIR || 'data/uploads')

export const storage: StorageAdapter = new LocalStorageAdapter(uploadDir)

export const UPLOAD_MAX_SIZE_MB = Number(process.env.UPLOAD_MAX_SIZE_MB || 10)
export const UPLOAD_MAX_SIZE_BYTES = UPLOAD_MAX_SIZE_MB * 1024 * 1024

const DEFAULT_ALLOWED_TYPES = 'image/*,application/pdf,text/*,.md,.csv,.json,.xml,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
export const UPLOAD_ALLOWED_TYPES = (process.env.UPLOAD_ALLOWED_TYPES || DEFAULT_ALLOWED_TYPES).split(',').map(s => s.trim())

/**
 * Upload gate. Note this is *not* the defence against hostile file contents, and can't be:
 * the `.md`/`.csv`/… patterns match on filename alone and ignore `mimeType` entirely, so a
 * file named `notes.md` sails through while declaring any type it likes. Serving safety is
 * enforced separately by `serveContentType()` + `isInlineSafe()` below, which ignore the
 * client's claim altogether — don't move that responsibility back here.
 */
export function isAllowedMimeType(mimeType: string, filename: string, allowed: string[] = UPLOAD_ALLOWED_TYPES): boolean {
  for (const pattern of allowed) {
    if (pattern.startsWith('.')) {
      if (filename.toLowerCase().endsWith(pattern.toLowerCase())) return true
    } else if (pattern.endsWith('/*')) {
      if (mimeType.startsWith(pattern.slice(0, -1))) return true
    } else {
      if (mimeType === pattern) return true
    }
  }
  return false
}

/**
 * Extension → Content-Type for *serving*, deliberately narrow and closed.
 *
 * Uploads carry a client-supplied `file.type` that ends up in `attachments.mimeType`. Echoing
 * that back on download turned any upload into stored XSS on the app's own origin: declare
 * `text/html`, get `Content-Type: text/html; Content-Disposition: inline`, and the file runs
 * as a first-party page — able to read the API as the viewer and mint a non-expiring API
 * token. Extension is the only part of the upload that also determines the stored filename,
 * so it's what we serve by.
 */
const SERVE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

/**
 * Types the browser renders itself and cannot be talked into executing script from, given
 * `X-Content-Type-Options: nosniff`. Anything absent — including `image/svg+xml`, which is a
 * live script context when opened as a document, and every unrecognised extension — is served
 * as a download instead.
 */
const INLINE_SAFE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'application/pdf',
  'text/plain',
  'application/json'
])

/** Content-Type to serve a stored file as, derived from its name and nothing else. */
export function serveContentType(originalName: string): string {
  return SERVE_CONTENT_TYPES[extname(originalName).toLowerCase()] || 'application/octet-stream'
}

/** Whether a served type may use `Content-Disposition: inline`. */
export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE_CONTENT_TYPES.has(contentType)
}

export function generateStorageKey(originalName: string): string {
  const ext = extname(originalName).toLowerCase() || ''
  return `${crypto.randomUUID()}${ext}`
}
