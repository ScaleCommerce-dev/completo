import { describe, it, expect } from 'vitest'
import { issueIdPattern, mergeEmbedded, refIndexEntries, resolveIssueRef, type IssueIndexEntry, type IssueRef } from '../../app/utils/issues'

describe('ticket ids in prose', () => {
  it('finds whole ids only, with any project key', () => {
    const found = [...'TK-12, xTK-3 TK-45a WEB-7. A-1 TOOLONG-2 ab-3'.matchAll(issueIdPattern())]
      .map(m => `${m[1]}-${m[2]}`)
    expect(found).toEqual(['TK-12', 'WEB-7'])
  })

  const entry = (id: number, key: string) => ({ id, project: { key } }) as unknown as IssueIndexEntry

  it('resolves an id only under its own project key', () => {
    const index = new Map([[42, entry(42, 'TK')]])
    expect(resolveIssueRef(index, 'TK', 42)?.id).toBe(42)
    // Card ids are global, so another project's key on the same number is a
    // different (or no) issue and must stay plain text.
    expect(resolveIssueRef(index, 'WEB', 42)).toBeUndefined()
    // Not in the index: unreadable to the viewer, or nonexistent.
    expect(resolveIssueRef(index, 'TK', 43)).toBeUndefined()
  })
})

describe('the issue page refetch', () => {
  it('merges what the card embeds and leaves its own columns to the ordered writes', () => {
    const current = { id: 1, priority: 'urgent', statusId: 's-new', parentId: null, relations: { blocks: [] } }
    const stale = { id: 1, priority: 'low', statusId: 's-old', parentId: 7, parent: { id: 7 }, relations: { blocks: [{ id: 3 }] } }
    expect(mergeEmbedded(current, stale)).toEqual({ id: 1, priority: 'urgent', statusId: 's-new', parentId: 7, parent: { id: 7 }, relations: { blocks: [{ id: 3 }] } })
  })
})

describe('refs in the issue index', () => {
  const status = { id: 's', name: 'To Do', category: 'unstarted' as const, color: null }

  it('turns a readable ref into an entry under its own project', () => {
    const ref: IssueRef = { id: 42, ticket: 'WEB-42', title: 'Elsewhere', projectId: 'p2', projectSlug: 'web', status }
    expect(refIndexEntries([ref])).toEqual([expect.objectContaining({ id: 42, ticket: 'WEB-42', project: expect.objectContaining({ slug: 'web', key: 'WEB' }) })])
  })

  it('leaves hidden refs out, whose key the viewer may not learn', () => {
    expect(refIndexEntries([{ id: 9, hidden: true }])).toEqual([])
  })
})
