import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { ProseMention } from './prose-mention'

/**
 * What `ProseEditor` adds on top of `UEditor`'s own stack.
 *
 * Nuxt UI's editor already brings StarterKit, inline code, horizontal rules, images,
 * a placeholder and the markdown parser; these are the gap. Kept in a module rather
 * than inside the component so that `prose-markdown.test.ts` can build an editor from
 * the *same* array — a round-trip guard that mirrored this list by hand would go on
 * passing after the list changed, which is the one way it could mislead.
 *
 * `TableKit` is not optional decoration. Without a table extension a description
 * containing a GFM table parses to nothing and **saves as nothing** — silent data
 * loss, and AI-generated descriptions produce tables regularly.
 *
 * `ProseMention` replaces `UEditor`'s own mention extension (the component passes
 * `:mention="false"`), which knows nothing of the `@[Name](userId)` syntax that
 * notifications are resolved from.
 */
export const PROSE_EXTENSIONS = [
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  ProseMention
]
