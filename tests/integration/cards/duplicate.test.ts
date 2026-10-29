import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard, createTestTag, setCardTags } from '../../setup/fixtures'

interface ProjectDetail {
  id: string
  slug: string
  statuses: Array<{ id: string, name: string }>
  boards: Array<{ id: string, slug: string }>
}

describe('POST /api/cards/:id/duplicate', () => {
  let owner: TestUser
  let outsider: TestUser
  let source: ProjectDetail
  let target: ProjectDetail
  let foreign: ProjectDetail
  let templateId: number
  let templateTagId: string
  let eventsTagId: string
  let scucTagId: string
  let eventsBoardId: string
  let scucBoardId: string
  let foreignBoardId: string

  const project = (user: TestUser, slug: string) =>
    $fetch(`/api/projects/${slug}`, { headers: user.headers }) as Promise<ProjectDetail>
  const createBoard = async (user: TestUser, p: ProjectDetail, name: string, tagFilters: string[] = []) =>
    ($fetch(`/api/projects/${p.id}/boards`, {
      method: 'POST',
      body: { name, columns: p.statuses.map(s => s.id), tagFilters },
      headers: user.headers
    }) as Promise<{ id: string }>).then(b => b.id)
  const duplicate = (user: TestUser, cardId: number, body: Record<string, unknown>) =>
    fetch(url(`/api/cards/${cardId}/duplicate`), {
      method: 'POST',
      headers: { ...user.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  const getCard = (user: TestUser, id: number) =>
    $fetch(`/api/cards/${id}`, { headers: user.headers }) as Promise<{
      id: number
      projectId: string
      statusId: string
      title: string
      description: string | null
      priority: string
      assigneeId: string | null
      tags: Array<{ id: string, name: string }>
    }>

  beforeAll(async () => {
    owner = await registerTestUser()
    outsider = await registerTestUser()

    source = await project(owner, ((await createTestProject(owner)) as { slug: string }).slug)
    target = await project(owner, ((await createTestProject(owner)) as { slug: string }).slug)
    foreign = await project(outsider, ((await createTestProject(outsider)) as { slug: string }).slug)

    templateTagId = (await createTestTag(owner, source.id, { name: 'Template' })).id
    eventsTagId = (await createTestTag(owner, source.id, { name: 'Events' })).id
    scucTagId = (await createTestTag(owner, target.id, { name: 'SCUC' })).id

    eventsBoardId = await createBoard(owner, source, 'Events', [eventsTagId])
    scucBoardId = await createBoard(owner, target, 'SCUC', [scucTagId])
    foreignBoardId = await createBoard(outsider, foreign, 'Not yours')

    const template = await createTestCard(owner, source.id, source.statuses[1]!.id, {
      title: 'Event template',
      description: '## Steps\n\n- [x] Book venue\n- [ ] Send invites',
      priority: 'high',
      assigneeId: owner.id
    })
    templateId = template.id
    await setCardTags(owner, templateId, [templateTagId, eventsTagId])
  })

  it('copies title and description with to-dos reset, into the first column, with the board\'s tags', async () => {
    const res = await duplicate(owner, templateId, { title: 'Summer event', boardId: eventsBoardId })
    expect(res.status).toBe(201)
    const copy = await getCard(owner, (await res.json()).id)

    expect(copy.title).toBe('Summer event')
    expect(copy.description).toBe('## Steps\n\n- [ ] Book venue\n- [ ] Send invites')
    expect(copy.projectId).toBe(source.id)
    expect(copy.statusId).toBe(source.statuses[0]!.id)
    // The template's own tags (incl. "Template") are not copied — only the board's.
    expect(copy.tags.map(t => t.id)).toEqual([eventsTagId])
    // Assignee and priority are not copied.
    expect(copy.assigneeId).toBeNull()
    expect(copy.priority).toBe('medium')
  })

  it('leaves the template untouched', async () => {
    const template = await getCard(owner, templateId)
    expect(template.description).toContain('- [x] Book venue')
    expect(template.tags.map(t => t.id).sort()).toEqual([templateTagId, eventsTagId].sort())
  })

  it('uses the tags the caller picks instead of the board default', async () => {
    const res = await duplicate(owner, templateId, { title: 'Picked tags', boardId: eventsBoardId, tagIds: [] })
    const copy = await getCard(owner, (await res.json()).id)
    expect(copy.tags).toEqual([])
  })

  it('copies into a board of another project the caller is a member of, with that project\'s tags', async () => {
    const res = await duplicate(owner, templateId, { title: 'SCUC', boardId: scucBoardId })
    expect(res.status).toBe(201)
    const copy = await getCard(owner, (await res.json()).id)
    expect(copy.projectId).toBe(target.id)
    expect(copy.statusId).toBe(target.statuses[0]!.id)
    expect(copy.tags.map(t => t.id)).toEqual([scucTagId])
  })

  it('refuses a tag from a different project than the target board', async () => {
    const res = await duplicate(owner, templateId, { title: 'Wrong tag', boardId: scucBoardId, tagIds: [eventsTagId] })
    expect(res.status).toBe(400)
  })

  it('places the copy where the board\'s status and priority filters let it be seen', async () => {
    const filtered = await createBoard(owner, source, 'Filtered')
    await $fetch(`/api/boards/${filtered}`, {
      method: 'PUT',
      body: { statusFilters: [source.statuses[2]!.id], priorityFilters: ['urgent'] },
      headers: owner.headers
    })
    const res = await duplicate(owner, templateId, { title: 'Filtered copy', boardId: filtered })
    const copy = await getCard(owner, (await res.json()).id)
    expect(copy.statusId).toBe(source.statuses[2]!.id)
    expect(copy.priority).toBe('urgent')
  })

  it('requires a title and a board', async () => {
    expect((await duplicate(owner, templateId, { title: '  ', boardId: eventsBoardId })).status).toBe(400)
    expect((await duplicate(owner, templateId, { title: 'No board' })).status).toBe(400)
  })

  describe('access', () => {
    it('cannot copy into a project the caller is not a member of — the board reads as not found', async () => {
      const res = await duplicate(owner, templateId, { title: 'Planted', boardId: foreignBoardId })
      expect(res.status).toBe(404)
    })

    it('cannot copy a card from a project the caller is not a member of', async () => {
      const res = await duplicate(outsider, templateId, { title: 'Stolen', boardId: foreignBoardId })
      expect(res.status).toBe(404)
    })

    it('treats an unknown board id like a foreign one', async () => {
      const res = await duplicate(owner, templateId, { title: 'Nowhere', boardId: crypto.randomUUID() })
      expect(res.status).toBe(404)
    })
  })
})
