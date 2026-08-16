/**
 * The row vocabulary shared by every table in the app.
 *
 * `admin/users.vue` built a `TABLE_UI` object out of literals under a comment
 * saying "these are ListView's header and cell metrics". Half of that was true:
 * the padding and the header treatment did match, and the cell type did not —
 * ListView's cells are `text-base` where the admin table's are `text-sm`. So the
 * comment asserted a relationship nothing held it to, which is the shape of
 * claim this repo deletes rather than softens.
 *
 * What is genuinely one decision is exported here and referenced from both. What
 * differs stays at the call site, where it can be argued about: an admin table
 * is a dense read-only report and a list view is an editing surface, so a step
 * of type between them is a real choice rather than drift.
 */

/**
 * Cell padding. Denser than UTable's `px-4 py-3.5` default, because this app is
 * an instrument panel rather than a document.
 */
export const TABLE_CELL_PAD = 'px-3 py-2'

/**
 * The column-header treatment. Uppercase at `tracking-label`, the same role
 * every other small uppercase label in the app uses.
 */
export const TABLE_HEAD_LABEL = 'text-xs font-bold uppercase tracking-label'
