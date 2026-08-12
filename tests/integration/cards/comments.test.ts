import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import {
  createTestProject,
  createTestBoard,
  createTestCard,
  createTestComment,
  createInvitation,
  getBoard,
  mention
} from '../../setup/fixtures'

interface Notification {
  type: string
  cardId: number | null
  message: string
}

async function notificationsFor(user: TestUser): Promise<Notification[]> {
  return await $fetch('/api/notifications', { headers: user.headers }) as Notification[]
}

describe('Card Comments', async () => {
  let author: TestUser
  let member: TestUser
  let outsider: TestUser
  let projectId: string
  let statusId: string
  let cardId: number

  beforeAll(async () => {
    author = await registerTestUser()
    member = await registerTestUser()
    outsider = await registerTestUser()

    const project = await createTestProject(author, { name: `Comments ${Date.now()}` })
    projectId = project.id
    // Existing users are added as members directly by this endpoint
    await createInvitation(author, projectId, member.email)

    const board = await createTestBoard(author, projectId)
    const fullBoard = await getBoard(author, board.id)
    statusId = fullBoard.columns[0]!.id
    const card = await createTestCard(author, projectId, statusId, { title: 'Commented Card' })
    cardId = card.id
  })

  it('creates a comment', async () => {
    const comment = await createTestComment(author, cardId, 'First!')

    expect(comment.id).toBeDefined()
    expect(comment.cardId).toBe(cardId)
    expect(comment.body).toBe('First!')
    expect(comment.authorId).toBe(author.id)
    expect(comment.authorName).toBe(author.name)
  })

  it('lists comments oldest first', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'List order' })
    await createTestComment(author, card.id, 'one')
    await createTestComment(author, card.id, 'two')

    const comments = await $fetch(`/api/cards/${card.id}/comments`, {
      headers: author.headers
    }) as Array<{ body: string }>

    expect(comments.map(c => c.body)).toEqual(['one', 'two'])
  })

  it('rejects an empty body', async () => {
    await expectError($fetch(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      body: { body: '   ' },
      headers: author.headers
    }), 400)
  })

  it('lets the author edit their comment and marks it edited', async () => {
    const comment = await createTestComment(author, cardId, 'typo here')

    const updated = await $fetch(`/api/comments/${comment.id}`, {
      method: 'PUT',
      body: { body: 'fixed' },
      headers: author.headers
    }) as { body: string, createdAt: string, updatedAt: string }

    expect(updated.body).toBe('fixed')
    expect(new Date(updated.updatedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(updated.createdAt).getTime())
  })

  it('lets the author delete their comment', async () => {
    const comment = await createTestComment(author, cardId, 'delete me')

    await $fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: author.headers
    })

    const comments = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string }>
    expect(comments.find(c => c.id === comment.id)).toBeUndefined()
  })

  it('forbids a fellow member from editing or deleting someone else\'s comment', async () => {
    const comment = await createTestComment(author, cardId, 'mine, not yours')

    await expectError($fetch(`/api/comments/${comment.id}`, {
      method: 'PUT',
      body: { body: 'hijacked' },
      headers: member.headers
    }), 403)

    await expectError($fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: member.headers
    }), 403)
  })

  it('never lets anyone edit someone else\'s comment, not even an owner or admin', async () => {
    // `author` created the project, so they are its owner
    const admin = await createAdminUser()
    const comment = await createTestComment(member, cardId, 'nobody may rewrite this')

    for (const moderator of [author, admin]) {
      await expectError($fetch(`/api/comments/${comment.id}`, {
        method: 'PUT',
        body: { body: 'rewritten' },
        headers: moderator.headers
      }), 403)
    }

    // unchanged
    const comments = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string, body: string }>
    expect(comments.find(c => c.id === comment.id)?.body).toBe('nobody may rewrite this')
  })

  it('lets the project owner delete someone else\'s comment', async () => {
    const comment = await createTestComment(member, cardId, 'moderated by owner')

    await $fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: author.headers
    })

    const comments = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string }>
    expect(comments.find(c => c.id === comment.id)).toBeUndefined()
  })

  it('lets an instance admin delete someone else\'s comment', async () => {
    const admin = await createAdminUser()
    const comment = await createTestComment(member, cardId, 'moderated by admin')

    await $fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: admin.headers
    })

    const comments = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string }>
    expect(comments.find(c => c.id === comment.id)).toBeUndefined()
  })

  it('still forbids an ordinary member from deleting someone else\'s comment', async () => {
    const comment = await createTestComment(author, cardId, 'members may not moderate')

    await expectError($fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: member.headers
    }), 403)
  })

  it('lets an owner clear a comment whose author deleted their account', async () => {
    const leaver = await registerTestUser()
    await createInvitation(author, projectId, leaver.email)
    const comment = await createTestComment(leaver, cardId, 'written by someone who left')

    await $fetch('/api/user/account', {
      method: 'DELETE',
      body: { password: 'testpass123' },
      headers: leaver.headers
    })

    // authorId is nulled rather than cascading, so the comment survives...
    const comments = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string, authorId: string | null, authorName: string | null }>
    const orphan = comments.find(c => c.id === comment.id)
    expect(orphan).toBeDefined()
    expect(orphan!.authorId).toBeNull()
    expect(orphan!.authorName).toBeNull()

    // ...and since nobody can satisfy the authorship check any more, owner-delete is
    // the only way such a comment can ever be removed.
    await $fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: author.headers
    })

    const after = await $fetch(`/api/cards/${cardId}/comments`, {
      headers: author.headers
    }) as Array<{ id: string }>
    expect(after.find(c => c.id === comment.id)).toBeUndefined()
  })

  it('hides comments from non-members with 404, not 403', async () => {
    await expectError($fetch(`/api/cards/${cardId}/comments`, {
      headers: outsider.headers
    }), 404)

    await expectError($fetch(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      body: { body: 'let me in' },
      headers: outsider.headers
    }), 404)

    const comment = await createTestComment(author, cardId, 'private')
    await expectError($fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: outsider.headers
    }), 404)
  })

  it('notifies a mentioned member, resolving by user id', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Mention card' })
    await createTestComment(author, card.id, `hey ${mention(member)} take a look`)

    const notifications = await notificationsFor(member)
    const mentionNote = notifications.find(n => n.type === 'mentioned' && n.cardId === card.id)

    expect(mentionNote).toBeDefined()
    expect(mentionNote!.message).toContain('in a comment on')
  })

  it('does not notify a mention of a non-member', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Outsider mention' })
    await createTestComment(author, card.id, `hello ${mention(outsider)}`)

    const notifications = await notificationsFor(outsider)
    expect(notifications.find(n => n.cardId === card.id)).toBeUndefined()
  })

  it('notifies the assignee of a new comment', async () => {
    const card = await createTestCard(author, projectId, statusId, {
      title: 'Assigned card',
      assigneeId: member.id
    })
    await createTestComment(author, card.id, 'progress?')

    const notifications = await notificationsFor(member)
    expect(notifications.find(n => n.type === 'comment_added' && n.cardId === card.id)).toBeDefined()
  })

  it('never notifies the author about their own comment', async () => {
    const card = await createTestCard(author, projectId, statusId, {
      title: 'Self assigned',
      assigneeId: author.id
    })
    await createTestComment(author, card.id, `note to self ${mention(author)}`)

    const notifications = await notificationsFor(author)
    expect(notifications.find(n => n.cardId === card.id)).toBeUndefined()
  })

  it('sends one notification when the assignee is also mentioned', async () => {
    const card = await createTestCard(author, projectId, statusId, {
      title: 'Assignee mentioned',
      assigneeId: member.id
    })
    await createTestComment(author, card.id, `${mention(member)} please review`)

    const notifications = await notificationsFor(member)
    // Assigning the card on creation also fires `card_assigned`, which is unrelated
    // to the comment — only comment-driven types matter here.
    const forComment = notifications.filter(n =>
      n.cardId === card.id && (n.type === 'mentioned' || n.type === 'comment_added'))

    expect(forComment).toHaveLength(1)
    expect(forComment[0]!.type).toBe('mentioned')
  })

  it('only notifies newly added mentions when a comment is edited', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Edit mentions' })
    const comment = await createTestComment(author, card.id, `first ${mention(member)}`)

    const afterCreate = (await notificationsFor(member)).filter(n => n.cardId === card.id)
    expect(afterCreate).toHaveLength(1)

    // Editing while keeping the same mention must not notify again
    await $fetch(`/api/comments/${comment.id}`, {
      method: 'PUT',
      body: { body: `first ${mention(member)} — updated` },
      headers: author.headers
    })

    const afterEdit = (await notificationsFor(member)).filter(n => n.cardId === card.id)
    expect(afterEdit).toHaveLength(1)
  })

  it('resolves a mention given the full user id as well as the short ref', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Full id mention' })
    await createTestComment(author, card.id, `full form ${mention(member, { full: true })}`)

    const notifications = await notificationsFor(member)
    expect(notifications.find(n => n.type === 'mentioned' && n.cardId === card.id)).toBeDefined()
  })

  it('notifies nobody for a mention ref that is not a valid id prefix', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Bad ref' })
    // `%` is a LIKE wildcard — it must never be treated as "matches everything"
    await createTestComment(author, card.id, `hi @[${member.name}](%) and @[${member.name}](zzz!)`)

    const notifications = await notificationsFor(member)
    expect(notifications.find(n => n.cardId === card.id)).toBeUndefined()
  })

  it('ignores legacy name-only mentions', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Legacy mention' })
    // Pre-id format: deliberately no longer resolved
    await createTestComment(author, card.id, `hello @[${member.name}]`)

    const notifications = await notificationsFor(member)
    expect(notifications.find(n => n.cardId === card.id)).toBeUndefined()
  })

  it('cascades comment deletion when the card is deleted', async () => {
    const card = await createTestCard(author, projectId, statusId, { title: 'Cascade' })
    const comment = await createTestComment(author, card.id, 'doomed')

    await $fetch(`/api/cards/${card.id}`, { method: 'DELETE', headers: author.headers })

    await expectError($fetch(`/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: author.headers
    }), 404)
  })
})
