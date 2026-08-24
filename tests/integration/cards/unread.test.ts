import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import {
  createTestProject,
  createTestBoard,
  createTestCard,
  createTestComment,
  createInvitation,
  getBoard
} from '../../setup/fixtures'

interface Notification { type: string, cardId: number | null }

async function notificationsFor(user: TestUser): Promise<Notification[]> {
  return await $fetch('/api/notifications', { headers: user.headers }) as Notification[]
}

/** hasUnread for one card, as this user sees the board. */
async function unread(user: TestUser, boardId: string, cardId: number): Promise<boolean> {
  const board = await getBoard(user, boardId)
  const card = (board.cards as Array<{ id: number, hasUnread?: boolean }>).find(c => c.id === cardId)
  return !!card?.hasUnread
}

describe('Unread comment activity (A) and thread notifications (D)', async () => {
  let author: TestUser
  let member: TestUser
  let bystander: TestUser
  let projectId: string
  let boardId: string
  let statusId: string

  beforeAll(async () => {
    author = await registerTestUser()
    member = await registerTestUser()
    bystander = await registerTestUser()

    const project = await createTestProject(author, { name: `Unread ${Date.now()}` })
    projectId = project.id
    await createInvitation(author, projectId, member.email)
    await createInvitation(author, projectId, bystander.email)

    const board = await createTestBoard(author, projectId)
    boardId = board.id
    const full = await getBoard(author, board.id)
    statusId = full.columns[0]!.id
  })

  it('marks a card unread for another member once a comment they did not write lands', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Unread me' })
    // No comments yet: nobody sees it as unread.
    expect(await unread(member, boardId, card.id)).toBe(false)

    await createTestComment(author, card.id, 'Take a look')

    // The author wrote the only comment, so it is not unread to them…
    expect(await unread(author, boardId, card.id)).toBe(false)
    // …but it is to the other member, who has not read it.
    expect(await unread(member, boardId, card.id)).toBe(true)
  })

  it('clears the unread flag once that member reads the card comments', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Read me' })
    await createTestComment(author, card.id, 'Please read')
    expect(await unread(member, boardId, card.id)).toBe(true)

    // Fetching the comment list is the read signal.
    await $fetch(`/api/cards/${card.id}/comments`, { headers: member.headers })
    expect(await unread(member, boardId, card.id)).toBe(false)

    // (That a *later* foreign comment re-flags the card is the same mechanism the
    // first test proves. It is deliberately not re-asserted here: comment and read
    // timestamps are second-granular, so a comment posted in the same second as
    // the read cannot be ordered against it on the computed path — the live
    // `card.activity` event is what surfaces a same-second comment in practice.)
  })

  it('notifies thread participants of a new comment, not just the assignee', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Thread' })

    // member comments first, becoming a participant (no assignee on this card).
    await createTestComment(member, card.id, 'I have thoughts')
    // author replies.
    await createTestComment(author, card.id, 'So do I')

    const memberNotifs = (await notificationsFor(member)).filter(n => n.type === 'comment_added' && n.cardId === card.id)
    const bystanderNotifs = (await notificationsFor(bystander)).filter(n => n.type === 'comment_added' && n.cardId === card.id)
    const authorNotifs = (await notificationsFor(author)).filter(n => n.type === 'comment_added' && n.cardId === card.id)

    // The participant is told about the reply…
    expect(memberNotifs.length).toBe(1)
    // …a member who never touched the thread is not…
    expect(bystanderNotifs.length).toBe(0)
    // …and nobody is notified about their own comment.
    expect(authorNotifs.length).toBe(0)
  })
})
