import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import ts from 'typescript'
import { getTableConfig, SQLiteTable, type SQLiteColumn } from 'drizzle-orm/sqlite-core'
import * as schema from '../../server/database/schema'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Every server path that changes what a card's history records has to record it.
 *
 * The history is only as complete as the least careful mutation path, and a
 * forgotten one fails silently: the change happens, nothing says who made it,
 * and nobody notices until they go looking. So rather than trusting a list of
 * the paths that exist today, this derives them. It parses every file under
 * `server/`, finds each write that can change a recorded field, and requires the
 * function containing that write to call `recordCardEvents` (directly, or through
 * a function that does).
 *
 * Which writes count is derived from two declarations, both checked:
 *
 * - `FIELD_HOME` says where each history field lives. It must cover the
 *   `card_events.field` enum exactly, so adding a field to the history without
 *   telling this guard where it is stored fails here.
 * - Deleting a row that a recorded column references changes the card through
 *   the foreign key: `set null` unassigns, `cascade` drops a tag. Those tables
 *   are read off the schema's foreign keys, not listed, which is how deleting a
 *   user (unassigns their cards) and deleting a tag (removes it from every card)
 *   are covered without anyone having remembered them.
 *
 * Not watched, by rule rather than by list: inserting a card (creation is read
 * off `cards.createdAt`/`createdById`, so there is one source) and deleting one
 * (its history is deleted with it).
 *
 * `EXEMPT` is for a write that genuinely changes nothing the history shows, such
 * as a function that only renumbers `position` within a status: reordering is
 * not history, because one drag renumbers a whole column. An entry carries its
 * reason, and goes stale (and fails) once the function stops writing or starts
 * recording. Widening the patterns below to make this pass is the failure mode.
 */
const EXEMPT: Record<string, string> = {}

/** Where each `card_events.field` lives. `created` is synthesized from the card row. */
const FIELD_HOME: Record<string, SQLiteColumn> = {
  status: schema.cards.statusId,
  assignee: schema.cards.assigneeId,
  priority: schema.cards.priority,
  dueDate: schema.cards.dueDate,
  title: schema.cards.title,
  description: schema.cards.description,
  tag: schema.cardTags.tagId,
  attachment: schema.attachments.id,
  parent: schema.cards.parentId,
  milestone: schema.cards.milestoneId,
  blocks: schema.cardRelations.id,
  blockedBy: schema.cardRelations.id,
  relates: schema.cardRelations.id,
  archived: schema.cards.archivedAt
}

const RECORDER = 'recordCardEvents'

// ─── Derivation ──────────────────────────────────────────────────────────────

const tableExportName = new Map<SQLiteTable, string>(
  Object.entries(schema)
    .filter((entry): entry is [string, SQLiteTable] => entry[1] instanceof SQLiteTable)
    .map(([name, table]) => [table, name])
)

const homeColumns = Object.values(FIELD_HOME)
const homeTables = [...new Set(homeColumns.map(c => c.table as SQLiteTable))]

/**
 * `cards` is the card itself, so only an update changes it (see the header for
 * inserts and deletes). The other homes are rows that exist per card: any write
 * to them adds, removes or alters something the history shows.
 */
const WATCHED = new Map<string, Set<string>>()
for (const table of homeTables) {
  const name = tableExportName.get(table)!
  WATCHED.set(name, new Set(table === schema.cards ? ['update'] : ['insert', 'update', 'delete']))
}

/** Tables whose deletion changes a recorded column through its foreign key. */
const FK_DERIVED = new Set<string>()
for (const table of homeTables) {
  for (const fk of getTableConfig(table).foreignKeys) {
    const ref = fk.reference()
    if (!ref.columns.some(c => homeColumns.includes(c as SQLiteColumn))) continue
    if (fk.onDelete !== 'cascade' && fk.onDelete !== 'set null') continue
    FK_DERIVED.add(tableExportName.get(ref.foreignTable)!)
  }
}
for (const name of FK_DERIVED) {
  const ops = WATCHED.get(name) ?? new Set<string>()
  ops.add('delete')
  WATCHED.set(name, ops)
}

// ─── Sweep ───────────────────────────────────────────────────────────────────

interface Site { file: string, fn: string, line: number, call: string }

const FILES = execSync(`find ${ROOT}/server -name '*.ts' -not -path '*/database/*'`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

/** The outermost function containing `node`: the handler, or a top-level util. */
function outermostFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  let found: ts.FunctionLikeDeclaration | null = null
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) found = n
  }
  return found
}

function functionLabel(file: string, fn: ts.FunctionLikeDeclaration): string {
  const name = fn.name && ts.isIdentifier(fn.name) ? fn.name.text : 'handler'
  return `${file} › ${name}`
}

/** `x.update(schema.cards)` and friends: the op and the table's export name. */
function watchedWrite(node: ts.Node): { op: string, table: string } | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null
  const op = node.expression.name.text
  const arg = node.arguments[0]
  if (!arg || !ts.isPropertyAccessExpression(arg) || !ts.isIdentifier(arg.expression) || arg.expression.text !== 'schema') return null
  const table = arg.name.text
  return WATCHED.get(table)?.has(op) ? { op, table } : null
}

function calledNames(fn: ts.Node): Set<string> {
  const names = new Set<string>()
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text)
    ts.forEachChild(n, visit)
  }
  visit(fn)
  return names
}

const writes: Site[] = []
const functions = new Map<string, { calls: Set<string>, declaredName: string | null }>()

for (const path of FILES) {
  const file = relative(ROOT, path)
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
      if (outermostFunction(node) === null) {
        functions.set(functionLabel(file, node), {
          calls: calledNames(node),
          declaredName: ts.isFunctionDeclaration(node) && node.name ? node.name.text : null
        })
      }
    }
    const write = watchedWrite(node)
    if (write) {
      const fn = outermostFunction(node)
      writes.push({
        file,
        fn: fn ? functionLabel(file, fn) : `${file} › (module)`,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        call: `${write.op}(schema.${write.table})`
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

/** `recordCardEvents`, and every top-level function that reaches it. */
const recorders = new Set([RECORDER])
for (let grew = true; grew;) {
  grew = false
  for (const { calls, declaredName } of functions.values()) {
    if (declaredName && !recorders.has(declaredName) && [...calls].some(c => recorders.has(c))) {
      recorders.add(declaredName)
      grew = true
    }
  }
}

const records = (label: string) => [...(functions.get(label)?.calls ?? [])].some(c => recorders.has(c))

const writers = [...new Set(writes.map(w => w.fn))]

// ─── Assertions ──────────────────────────────────────────────────────────────

describe('card history recording', () => {
  it('knows where every history field lives', () => {
    const field = getTableConfig(schema.cardEvents).columns.find(c => c.name === 'field') as unknown as { enumValues: string[] }
    expect(Object.keys(FIELD_HOME).sort()).toEqual(field.enumValues.filter(v => v !== 'created').sort())
  })

  it('derives the tables whose deletion changes a card from the schema', () => {
    // A sanity check on the derivation, not the list it should produce: an
    // assignee is a user, so users must be among them, and a project's
    // deletion deletes its cards rather than changing them.
    expect(FK_DERIVED.has('users')).toBe(true)
    expect(FK_DERIVED.has('projects')).toBe(false)
  })

  it('finds the card writes it is meant to police', () => {
    // A sweep that finds nothing passes everything.
    expect(writers.length).toBeGreaterThan(5)
    expect(writes.some(w => w.call === 'update(schema.cards)')).toBe(true)
  })

  for (const fn of writers) {
    if (EXEMPT[fn]) continue
    it(`${fn} records what it changes`, () => {
      const sites = writes.filter(w => w.fn === fn).map(w => `${w.call} at line ${w.line}`)
      expect(records(fn), `writes ${sites.join(', ')} without calling ${RECORDER}`).toBe(true)
    })
  }

  for (const [fn, reason] of Object.entries(EXEMPT)) {
    it(`${fn} is still exempt (${reason})`, () => {
      expect(writers, 'no longer writes anything the history records: drop it from EXEMPT').toContain(fn)
      expect(records(fn), 'records now: drop it from EXEMPT').toBe(false)
    })
  }
})
