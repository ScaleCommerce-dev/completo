import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard, createTestComment } from '../../setup/fixtures'
import { addMember } from '../../setup/agents'

/**
 * Comment notifications go to the card's assignee and earlier commenters, both
 * read from history. Removing a member changes neither, so without a membership
 * check in createNotifications an ex-member kept receiving the card title of
 * every new comment in a project they can no longer open.
 */
describe('comment notifications after removal', () => {
  let owner: TestUser
  let leaver: TestUser
  let cardId: number

  beforeAll(async () => {
    owner = await registerTestUser()
    leaver = await registerTestUser()
    const project = await createTestProject(owner)
    const board = await createTestBoard(owner, project.id)
    const statusId = (await getBoard(owner, board.id)).columns[0].id
    await addMember(owner, project.id, leaver.id)

    const card = await createTestCard(owner, project.id, statusId, { assigneeId: leaver.id })
    cardId = card.id
    await createTestComment(leaver, cardId, 'I was here')
    // While still a member this does notify them — the control for the test below.
    await createTestComment(owner, cardId, 'while you were here')

    await $fetch(`/api/projects/${project.id}/members/${leaver.id}`, { method: 'DELETE', headers: owner.headers })
  })

  it('reach neither the former assignee nor the former commenter', async () => {
    const before = await $fetch<Array<{ type: string }>>('/api/notifications', { headers: leaver.headers })
    expect(before.some(n => n.type === 'comment_added')).toBe(true)
    await createTestComment(owner, cardId, 'after you left')
    const after = await $fetch<Array<{ type: string }>>('/api/notifications', { headers: leaver.headers })
    expect(after.filter(n => n.type === 'comment_added').length)
      .toBe(before.filter(n => n.type === 'comment_added').length)
  })
})
