// Sub-issues, relations, milestones, project state and the history they leave.
import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard, createTestTag, setCardTags } from '../../setup/fixtures'
import { statuses, statusId, addStatus, addMember } from './helpers'

interface CardRef { id: number, title?: string, ticket?: string, hidden?: boolean }

interface CardDetail {
  projectId: string
  statusId: string
  assigneeId: string | null
  archivedAt: string | null
  parent: (CardRef & { childProgress?: unknown }) | null
  children: CardRef[]
  childProgress: { total: number, completed: number }
  relations: { blocks: CardRef[], blockedBy: CardRef[], relates: CardRef[] }
  milestone: { id: string, name: string } | null
  tags: Array<{ id: string }>
}

interface HistoryEvent {
  field: string
  from: { id: string | null, value: string, card?: CardRef } | null
  to: { id: string | null, value: string, card?: CardRef } | null
  actor: { id: string } | null
}

async function getCard(u: TestUser, id: number) {
  return await $fetch(`/api/cards/${id}`, { headers: u.headers }) as CardDetail
}

async function history(u: TestUser, id: number) {
  return (await $fetch(`/api/cards/${id}/history`, { headers: u.headers }) as { events: HistoryEvent[] }).events
}

describe('issue workflow', () => {
  let owner: TestUser
  let outsider: TestUser
  let projectA: { id: string, key: string, slug: string }
  let projectB: { id: string, key: string, slug: string }
  let backlogA: string
  let todoA: string

  beforeAll(async () => {
    owner = await registerTestUser()
    outsider = await registerTestUser()
    projectA = await createTestProject(owner)
    projectB = await createTestProject(owner)
    backlogA = await statusId(owner, projectA.id, 'Backlog')
    todoA = await statusId(owner, projectA.id, 'To Do')
  })

  describe('projects', () => {
    it('keeps its own key', async () => {
      expect(projectA.key).not.toBe(projectB.key)
    })

    it('a new project\'s statuses are ordered and categorised', async () => {
      const st = await statuses(owner, projectA.id)
      const ordered = [...st].sort((a, b) => a.position - b.position)
      expect(ordered.map(s => [s.name, s.category])).toEqual([
        ['Backlog', 'backlog'],
        ['To Do', 'unstarted'],
        ['In Progress', 'started'],
        ['Review', 'started'],
        ['Done', 'completed']
      ])
    })

    it('a new status goes last and takes its category from the name, or the one given', async () => {
      const canceled = await $fetch(`/api/projects/${projectB.id}/statuses`, { method: 'POST', headers: owner.headers, body: { name: 'Canceled' } }) as { category: string, position: number }
      expect(canceled).toMatchObject({ category: 'canceled', position: 5 })
      const custom = await $fetch(`/api/projects/${projectB.id}/statuses`, { method: 'POST', headers: owner.headers, body: { name: 'Shipped', category: 'completed' } }) as { id: string, category: string }
      expect(custom.category).toBe('completed')
      await expectError($fetch(`/api/projects/${projectB.id}/statuses`, { method: 'POST', headers: owner.headers, body: { name: 'X', category: 'nope' } }), 400)
      const renamed = await $fetch(`/api/statuses/${custom.id}`, { method: 'PUT', headers: owner.headers, body: { category: 'started' } }) as { category: string }
      expect(renamed.category).toBe('started')
    })

    it('stores lead, state and dates with their resolution', async () => {
      const updated = await $fetch(`/api/projects/${projectA.id}`, {
        method: 'PUT',
        headers: owner.headers,
        body: { leadId: owner.id, state: 'started', targetDate: '2026-10-01', targetDateResolution: 'quarter' }
      }) as Record<string, unknown>
      expect(updated).toMatchObject({ leadId: owner.id, state: 'started', targetDate: '2026-10-01', targetDateResolution: 'quarter' })
    })

    it('refuses a lead who is not a member, an unknown state and an impossible date', async () => {
      await expectError($fetch(`/api/projects/${projectA.id}`, { method: 'PUT', headers: owner.headers, body: { leadId: outsider.id } }), 400)
      await expectError($fetch(`/api/projects/${projectA.id}`, { method: 'PUT', headers: owner.headers, body: { state: 'nope' } }), 400)
      await expectError($fetch(`/api/projects/${projectA.id}`, { method: 'PUT', headers: owner.headers, body: { targetDate: '2026-13-45' } }), 400)
    })
  })

  describe('milestones', () => {
    it('creates, lists in order, assigns to a card and reports progress', async () => {
      const m1 = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'Foundations', description: 'Formats' } }) as { id: string }
      const m2 = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'Launch' } }) as { id: string }
      const done = await statusId(owner, projectA.id, 'Done')
      const canceled = await addStatus(owner, projectA.id, 'Canceled')

      const c1 = await createTestCard(owner, projectA.id, backlogA)
      const c2 = await createTestCard(owner, projectA.id, done)
      // A canceled issue leaves the milestone's scope.
      const c3 = await createTestCard(owner, projectA.id, canceled)
      for (const c of [c1, c2, c3]) {
        await $fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: m1.id } })
      }

      const list = await $fetch(`/api/projects/${projectA.id}/milestones`, { headers: owner.headers }) as Array<{ id: string, name: string, total: number, completed: number }>
      expect(list.map(m => m.name)).toEqual(['Foundations', 'Launch'])
      expect(list[0]).toMatchObject({ id: m1.id, total: 2, completed: 1 })
      expect(list[1]).toMatchObject({ id: m2.id, total: 0, completed: 0 })

      expect((await getCard(owner, c1.id)).milestone).toMatchObject({ id: m1.id, name: 'Foundations' })
    })

    it('refuses a milestone of another project', async () => {
      const mb = await $fetch(`/api/projects/${projectB.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'B' } }) as { id: string }
      const c = await createTestCard(owner, projectA.id, backlogA)
      await expectError($fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: mb.id } }), 400)
    })

    it('hides milestones from non-members', async () => {
      await expectError($fetch(`/api/projects/${projectA.id}/milestones`, { headers: outsider.headers }), 404)
      const m = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'Hidden' } }) as { id: string }
      await expectError($fetch(`/api/milestones/${m.id}`, { method: 'PUT', headers: outsider.headers, body: { name: 'x' } }), 404)
      await expectError($fetch(`/api/milestones/${m.id}`, { method: 'DELETE', headers: outsider.headers }), 404)
    })

    it('deleting a milestone keeps its cards and records that they left it', async () => {
      const m = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'Short-lived' } }) as { id: string }
      const c = await createTestCard(owner, projectA.id, backlogA)
      await $fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: m.id } })
      await $fetch(`/api/milestones/${m.id}`, { method: 'DELETE', headers: owner.headers })
      expect((await getCard(owner, c.id)).milestone).toBeNull()
      const events = (await history(owner, c.id)).filter(e => e.field === 'milestone')
      expect(events.map(e => [e.from?.value ?? null, e.to?.value ?? null])).toEqual([[null, 'Short-lived'], ['Short-lived', null]])
    })
  })

  describe('parent and sub-issues', () => {
    it('sets a parent, lists children with progress, and clears it', async () => {
      const parent = await createTestCard(owner, projectA.id, backlogA, { title: 'Parent issue' })
      const child = await createTestCard(owner, projectA.id, todoA, { title: 'Child issue' })
      await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })

      const p = await getCard(owner, parent.id)
      expect(p.children.map(c => c.id)).toEqual([child.id])
      expect(p.childProgress).toEqual({ total: 1, completed: 0 })
      expect((await getCard(owner, child.id)).parent).toMatchObject({ id: parent.id, title: 'Parent issue', ticket: `${projectA.key}-${parent.id}`, projectSlug: projectA.slug })

      await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: null } })
      expect((await getCard(owner, child.id)).parent).toBeNull()
    })

    it('creates a card as a sub-issue', async () => {
      const parent = await createTestCard(owner, projectA.id, backlogA)
      const child = await $fetch(`/api/projects/${projectA.id}/cards`, { method: 'POST', headers: owner.headers, body: { statusId: todoA, title: 'born a child', parentId: parent.id } }) as { parentId: number }
      expect(child.parentId).toBe(parent.id)
    })

    it('refuses itself, a cycle and an unknown card as parent', async () => {
      const a = await createTestCard(owner, projectA.id, backlogA)
      const b = await createTestCard(owner, projectA.id, backlogA)
      await $fetch(`/api/cards/${b.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: a.id } })
      await expectError($fetch(`/api/cards/${a.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: a.id } }), 400)
      await expectError($fetch(`/api/cards/${a.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: b.id } }), 400)
      await expectError($fetch(`/api/cards/${a.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: 999999999 } }), 400)
    })

    it('refuses a parent in a project the caller cannot see', async () => {
      const foreignOwner = await registerTestUser()
      const foreign = await createTestProject(foreignOwner)
      const hiddenCard = await createTestCard(foreignOwner, foreign.id, (await statuses(foreignOwner, foreign.id))[0]!.id)
      const c = await createTestCard(owner, projectA.id, backlogA)
      await expectError($fetch(`/api/cards/${c.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: hiddenCard.id } }), 400)
      await expectError($fetch(`/api/projects/${projectA.id}/cards`, { method: 'POST', headers: owner.headers, body: { statusId: backlogA, title: 'x', parentId: hiddenCard.id } }), 400)
    })

    it('deleting a parent leaves its sub-issues top-level, and their history says so', async () => {
      const parent = await createTestCard(owner, projectA.id, backlogA)
      const child = await createTestCard(owner, projectA.id, backlogA)
      await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })
      await $fetch(`/api/cards/${parent.id}`, { method: 'DELETE', headers: owner.headers })
      expect((await getCard(owner, child.id)).parent).toBeNull()
      const events = (await history(owner, child.id)).filter(e => e.field === 'parent')
      expect(events.map(e => [e.from?.value ?? null, e.to?.value ?? null])).toEqual([
        [null, `${projectA.key}-${parent.id}`],
        [`${projectA.key}-${parent.id}`, null]
      ])
    })
  })

  describe('relations', () => {
    it('blocks reads as blocked by from the other side, across projects', async () => {
      const stB = await statuses(owner, projectB.id)
      const a = await createTestCard(owner, projectA.id, backlogA, { title: 'blocker' })
      const b = await createTestCard(owner, projectB.id, stB[0]!.id, { title: 'blocked' })
      await $fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'blocks', cardId: b.id } })

      expect((await getCard(owner, a.id)).relations.blocks).toEqual([expect.objectContaining({ id: b.id, projectSlug: projectB.slug })])
      const bCard = await getCard(owner, b.id)
      expect(bCard.relations.blockedBy).toEqual([expect.objectContaining({ id: a.id, title: 'blocker', projectSlug: projectA.slug })])
    })

    it('blocked_by is stored as the reverse blocks', async () => {
      const a = await createTestCard(owner, projectA.id, backlogA)
      const b = await createTestCard(owner, projectA.id, backlogA)
      await $fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'blocked_by', cardId: b.id } })
      expect((await getCard(owner, b.id)).relations.blocks.map(r => r.id)).toEqual([a.id])
    })

    it('relates reads from both ends, and is deletable from either', async () => {
      const a = await createTestCard(owner, projectA.id, backlogA)
      const b = await createTestCard(owner, projectA.id, backlogA)
      const rel = await $fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'relates', cardId: b.id } }) as { id: string }
      expect((await getCard(owner, b.id)).relations.relates.map(r => r.id)).toEqual([a.id])
      await $fetch(`/api/cards/${b.id}/relations/${rel.id}`, { method: 'DELETE', headers: owner.headers })
      expect((await getCard(owner, a.id)).relations.relates).toEqual([])
    })

    it('refuses self, duplicates (also reversed relates) and unknown types', async () => {
      const a = await createTestCard(owner, projectA.id, backlogA)
      const b = await createTestCard(owner, projectA.id, backlogA)
      await expectError($fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'blocks', cardId: a.id } }), 400)
      await $fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'relates', cardId: b.id } })
      await expectError($fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'relates', cardId: b.id } }), 409)
      await expectError($fetch(`/api/cards/${b.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'relates', cardId: a.id } }), 409)
      await expectError($fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'duplicates', cardId: b.id } }), 400)
    })

    it('shows only the id of a related card in a project the viewer is not a member of', async () => {
      const member = await registerTestUser()
      await addMember(owner, projectA.id, member)
      const stB = await statuses(owner, projectB.id)
      const a = await createTestCard(owner, projectA.id, backlogA)
      const secret = await createTestCard(owner, projectB.id, stB[0]!.id, { title: 'secret title' })
      await $fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'blocks', cardId: secret.id } })

      const seen = await getCard(member, a.id)
      // The relation id stays so the member can remove the link; nothing of the card itself.
      expect(seen.relations.blocks).toEqual([{ id: secret.id, hidden: true, relationId: expect.any(String) }])
      expect(JSON.stringify(seen)).not.toContain('secret title')
      // Its history names the card by its number only: the stored ticket id would name project B.
      const added = (await history(member, a.id)).find(e => e.field === 'blocks')!
      expect(added.to).toEqual({ id: String(secret.id), value: `#${secret.id}`, card: { id: secret.id, hidden: true } })
    })

    it('a member cannot link to a card they cannot see, and outsiders get 404', async () => {
      const member = await registerTestUser()
      await addMember(owner, projectA.id, member)
      const stB = await statuses(owner, projectB.id)
      const a = await createTestCard(owner, projectA.id, backlogA)
      const secret = await createTestCard(owner, projectB.id, stB[0]!.id)
      await expectError($fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: member.headers, body: { type: 'relates', cardId: secret.id } }), 400)
      await expectError($fetch(`/api/cards/${a.id}/relations`, { method: 'POST', headers: outsider.headers, body: { type: 'relates', cardId: secret.id } }), 404)
    })
  })

  describe('moving a card to another project', () => {
    it('maps the status by name and keeps relations and parent', async () => {
      const parent = await createTestCard(owner, projectA.id, backlogA)
      const card = await createTestCard(owner, projectA.id, todoA)
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { parentId: parent.id } })

      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { projectId: projectB.id } })
      const moved = await getCard(owner, card.id)
      expect(moved.projectId).toBe(projectB.id)
      expect(moved.statusId).toBe(await statusId(owner, projectB.id, 'To Do'))
      expect(moved.parent?.id).toBe(parent.id)
    })

    it('drops the milestone, the tags and an assignee who is not a member there', async () => {
      const member = await registerTestUser()
      await addMember(owner, projectA.id, member)
      const ms = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'only A' } }) as { id: string }
      const tag = await createTestTag(owner, projectA.id, { name: 'only A' })
      const card = await createTestCard(owner, projectA.id, todoA, { assigneeId: member.id })
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { milestoneId: ms.id } })
      await setCardTags(owner, card.id, [tag.id])

      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { projectId: projectB.id } })
      const moved = await getCard(owner, card.id)
      expect(moved.milestone).toBeNull()
      expect(moved.tags).toEqual([])
      expect(moved.assigneeId).toBeNull()
    })

    it('requires membership in the target project, and a status of it set separately', async () => {
      const member = await registerTestUser()
      await addMember(owner, projectA.id, member)
      const card = await createTestCard(member, projectA.id, todoA)
      await expectError($fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: member.headers, body: { projectId: projectB.id } }), 400)
      await expectError($fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { projectId: projectB.id, statusId: todoA } }), 400)
    })
  })

  describe('history', () => {
    it('records parent, milestone, relations and the archive alongside the other changes', async () => {
      const ms = await $fetch(`/api/projects/${projectA.id}/milestones`, { method: 'POST', headers: owner.headers, body: { name: 'History' } }) as { id: string }
      const blocker = await createTestCard(owner, projectA.id, backlogA, { title: 'the blocker' })
      const parent = await createTestCard(owner, projectA.id, backlogA)
      const card = await createTestCard(owner, projectA.id, backlogA)
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { statusId: await statusId(owner, projectA.id, 'In Progress'), parentId: parent.id, milestoneId: ms.id } })
      const rel = await $fetch(`/api/cards/${blocker.id}/relations`, { method: 'POST', headers: owner.headers, body: { type: 'blocks', cardId: card.id } }) as { id: string }
      await $fetch(`/api/cards/${card.id}/relations/${rel.id}`, { method: 'DELETE', headers: owner.headers })
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { archived: true } })
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', headers: owner.headers, body: { archived: false } })

      const events = await history(owner, card.id)
      expect(events.map(e => e.field)).toEqual(['created', 'status', 'parent', 'milestone', 'blockedBy', 'blockedBy', 'archived', 'archived'])
      const blockedBy = events.find(e => e.field === 'blockedBy')!
      expect(blockedBy.to).toMatchObject({ id: String(blocker.id), value: `${projectA.key}-${blocker.id}`, card: { id: blocker.id, title: 'the blocker' } })
      expect(events.at(-2)!.to).toEqual({ id: null, value: 'archived' })
      expect(events.at(-1)!.from).toEqual({ id: null, value: 'archived' })
      expect(events[1]!.actor!.id).toBe(owner.id)

      // The blocking card records its side of the same relation.
      const theirs = (await history(owner, blocker.id)).filter(e => e.field === 'blocks')
      expect(theirs.map(e => [e.from?.id ?? null, e.to?.id ?? null])).toEqual([[null, String(card.id)], [String(card.id), null]])
    })
  })

  describe('issues across projects', () => {
    it('lists only the caller\'s projects, with project, status category, parent and relation counts', async () => {
      const viewer = await registerTestUser()
      const mine = await createTestProject(viewer)
      const parent = await createTestCard(viewer, mine.id, await statusId(viewer, mine.id, 'To Do'), { title: 'P' })
      const child = await createTestCard(viewer, mine.id, await statusId(viewer, mine.id, 'Done'), { title: 'C' })
      await $fetch(`/api/cards/${child.id}`, { method: 'PUT', headers: viewer.headers, body: { parentId: parent.id } })
      await $fetch(`/api/cards/${parent.id}/relations`, { method: 'POST', headers: viewer.headers, body: { type: 'blocks', cardId: child.id } })

      const issues = await $fetch('/api/issues', { headers: viewer.headers, query: { view: 'all' } }) as Array<Record<string, unknown> & { id: number }>
      expect(issues.map(i => i.id).sort()).toEqual([parent.id, child.id].sort())
      const p = issues.find(i => i.id === parent.id)!
      expect(p).toMatchObject({ ticket: `${mine.key}-${parent.id}`, project: { id: mine.id }, status: { name: 'To Do', category: 'unstarted' }, blockingCount: 1, blockedByCount: 0, childProgress: { total: 1, completed: 1 } })
      expect(issues.find(i => i.id === child.id)).toMatchObject({ parentId: parent.id, blockedByCount: 1 })
    })

    it('active hides backlog and closed issues, backlog shows only backlog, a project filter narrows', async () => {
      const viewer = await registerTestUser()
      const mine = await createTestProject(viewer)
      const other = await createTestProject(viewer)
      const b = await createTestCard(viewer, mine.id, await statusId(viewer, mine.id, 'Backlog'))
      const t = await createTestCard(viewer, mine.id, await statusId(viewer, mine.id, 'To Do'))
      const d = await createTestCard(viewer, mine.id, await statusId(viewer, mine.id, 'Done'))
      const o = await createTestCard(viewer, other.id, await statusId(viewer, other.id, 'To Do'))

      const ids = async (query: Record<string, string>) => ((await $fetch('/api/issues', { headers: viewer.headers, query })) as Array<{ id: number }>).map(i => i.id).sort()
      expect(await ids({ view: 'active' })).toEqual([t.id, o.id].sort())
      expect(await ids({ view: 'backlog' })).toEqual([b.id])
      expect(await ids({ view: 'all', projectId: mine.id })).toEqual([b.id, t.id, d.id].sort())
      await expectError($fetch('/api/issues', { headers: viewer.headers, query: { view: 'all', projectId: projectA.id } }), 404)
      await expectError($fetch('/api/issues', { headers: viewer.headers, query: { view: 'nope' } }), 400)
    })
  })
})
