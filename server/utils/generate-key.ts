export function generateKey(name: string): string {
  // Split on spaces/dashes/underscores, then further split camelCase/PascalCase parts
  const parts = name.split(/[\s\-_]+/).filter(w => w.length > 0)
  const words = parts.flatMap(w => w.split(/(?<=[a-z])(?=[A-Z])/))
  let key = words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '')

  // If we only got 0-1 characters (single word), take more letters from the first word
  if (key.length < 2 && words.length > 0) {
    key = words[0]!.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
  }

  key = key.slice(0, 5)
  return key.length >= 2 ? key : 'PR'
}
