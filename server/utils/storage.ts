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

  async write(key: string, data: Buffer): Promise<void> {
    this.ensureDir()
    writeFileSync(resolve(this.dir, key), data)
  }

  async read(key: string): Promise<Buffer | null> {
    const path = resolve(this.dir, key)
    if (!existsSync(path)) return null
    return readFileSync(path)
  }

  async delete(key: string): Promise<void> {
    const path = resolve(this.dir, key)
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

export function generateStorageKey(originalName: string): string {
  const ext = extname(originalName).toLowerCase() || ''
  return `${crypto.randomUUID()}${ext}`
}
