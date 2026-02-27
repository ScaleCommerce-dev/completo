export function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'i-lucide-image'
  if (mimeType === 'application/pdf') return 'i-lucide-file-text'
  if (mimeType.startsWith('text/')) return 'i-lucide-file-text'
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'i-lucide-file-spreadsheet'
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'i-lucide-file-archive'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'i-lucide-file-text'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${i === 0 ? size : size.toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`
}
