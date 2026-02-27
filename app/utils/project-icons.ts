import lucideData from '@iconify-json/lucide/icons.json'

export const PROJECT_ICONS = [
  // General
  'folder', 'briefcase', 'building-2', 'home', 'globe',
  // Development
  'code', 'terminal', 'git-branch', 'bug', 'cpu',
  // Design
  'palette', 'pen-tool', 'figma', 'layout', 'image',
  // Communication
  'mail', 'message-circle', 'megaphone', 'phone', 'radio',
  // Data
  'database', 'bar-chart-3', 'pie-chart', 'trending-up', 'activity',
  // Planning
  'rocket', 'target', 'flag', 'map', 'compass',
  // Infrastructure
  'server', 'cloud', 'shield', 'lock', 'wifi',
  // Content
  'book-open', 'file-text', 'newspaper', 'graduation-cap', 'lightbulb',
  // Commerce
  'shopping-cart', 'credit-card', 'receipt', 'package', 'truck',
  // Organization
  'users', 'heart', 'star', 'award', 'crown'
] as const

export const ALL_LUCIDE_ICONS: string[] = Object.keys(lucideData.icons).sort()
