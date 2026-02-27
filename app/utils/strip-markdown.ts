/**
 * Strip markdown syntax for plain-text previews (e.g. kanban card descriptions).
 */
export function stripMarkdown(text: string): string {
  return text
    // @[Name] mentions → @Name
    .replace(/@\[([^\]]+)\]/g, '@$1')
    // Code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, '')
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Headings
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    // Strikethrough
    .replace(/~~([^~]+)~~/g, '$1')
    // Blockquotes
    .replace(/^>\s+/gm, '')
    // Unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse whitespace
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
}
