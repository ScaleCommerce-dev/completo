import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestList, createTestCard, getBoard, getList } from '../../setup/fixtures'

/**
 * The card creator is stored as `createdById` and exposed as a resolved `creator`
 * object. It's set once at insert and never editable, so these tests care about two
 * things: that the right user lands there, and that every surface offering a creator
 * column actually returns the field.
 */
describe('Card creator', async () => {
  let owner: TestUser
  let member: TestUser
  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
  })

  async function projectWithStatus(name: string) {
    const project = await createTestProject(owner, { name: `${name} ${Date.now()}` })
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })
    const board = await createTestBoard(owner, project.id)
    const fullBoard = await getBoard(owner, board.id)
    return { project, statusId: fullBoard.columns[0].id as string }
  }

  it('resolves the creator on GET /api/cards/:id', async () => {
    const { project, statusId } = await projectWithStatus('Creator Get')
    const card = await createTestCard(owner, project.id, statusId, { title: 'Has A Creator' })

    const full = await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as Record<string, unknown>

    expect(full.createdById).toBe(owner.id)
    expect(full.creator).toBeTruthy()
    expect(full.creator.id).toBe(owner.id)
    expect(full.creator.name).toBe(owner.name)
  })

  it('reports the creator, not the assignee', async () => {
    const { project, statusId } = await projectWithStatus('Creator Vs Assignee')
    const card = await createTestCard(owner, project.id, statusId, {
      title: 'Created by owner, assigned to member',
      assigneeId: member.id
    })

    const full = await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as Record<string, unknown>

    expect(full.creator.id).toBe(owner.id)
    expect(full.assignee.id).toBe(member.id)
  })

  it('credits the member who created the card, not the project owner', async () => {
    const { project, statusId } = await projectWithStatus('Creator Member')
    const card = await createTestCard(member, project.id, statusId, { title: 'Member Made This' })

    const full = await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as Record<string, unknown>

    expect(full.creator.id).toBe(member.id)
  })

  it('includes the creator on list view cards', async () => {
    const { project, statusId } = await projectWithStatus('Creator List')
    const card = await createTestCard(member, project.id, statusId, { title: 'Listed Card' })

    const list = await createTestList(owner, project.id, { columns: ['title', 'creator'] })
    const fullList = await getList(owner, list.id)

    const listed = fullList.cards.find((c: Record<string, unknown>) => c.id === card.id)
    expect(listed).toBeTruthy()
    expect(listed!.creator.id).toBe(member.id)
    expect(listed!.creator.name).toBe(member.name)
    expect(fullList.columns.map((c: Record<string, unknown>) => c.field)).toContain('creator')
  })

  it('includes the creator on my-tasks cards', async () => {
    const { project, statusId } = await projectWithStatus('Creator My Tasks')
    await createTestCard(owner, project.id, statusId, {
      title: 'Assigned To Member',
      assigneeId: member.id
    })

    const data = await $fetch('/api/my-tasks', { headers: member.headers }) as Record<string, unknown>

    const group = data.groups.find((g: Record<string, unknown>) => g.project.id === project.id)
    expect(group).toBeTruthy()
    expect(group.cards[0].creator.id).toBe(owner.id)
  })

  it('accepts creator as a list column and as a saved sort field', async () => {
    const { project } = await projectWithStatus('Creator Column')
    const list = await createTestList(owner, project.id, { columns: ['title'] })

    const col = await $fetch(`/api/lists/${list.id}/columns`, {
      method: 'POST',
      body: { field: 'creator' },
      headers: owner.headers
    }) as Record<string, unknown>
    expect(col.field).toBe('creator')

    await $fetch(`/api/lists/${list.id}`, {
      method: 'PUT',
      body: { sortField: 'creator', sortDirection: 'asc' },
      headers: owner.headers
    })
    const fullList = await getList(owner, list.id)
    expect(fullList.sortField).toBe('creator')
  })

  it('accepts creator as a my-tasks column', async () => {
    const col = await $fetch('/api/my-tasks/columns', {
      method: 'POST',
      body: { field: 'creator' },
      headers: member.headers
    }) as Record<string, unknown>

    expect(col.field).toBe('creator')
  })

  it('still rejects unknown column fields', async () => {
    const { project } = await projectWithStatus('Creator Invalid')
    const list = await createTestList(owner, project.id)

    await expectError($fetch(`/api/lists/${list.id}/columns`, {
      method: 'POST',
      body: { field: 'creatorId' },
      headers: owner.headers
    }), 400)
  })
})
