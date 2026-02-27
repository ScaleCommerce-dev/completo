import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

describe('Notifications', () => {
  let owner: TestUser
  let member: TestUser
  let project: Record<string, unknown>
  let board: Record<string, unknown>
  let statusId: string

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    project = await createTestProject(owner)
    board = await createTestBoard(owner, project.id)
    const boardData = await getBoard(owner, board.id)
    statusId = boardData.columns[0].id
  })

  it('returns empty list for new user', async () => {
    const notifications = await $fetch('/api/notifications', {
      headers: member.headers
    })
    expect(notifications).toEqual([])
  })

  it('returns unread count of 0 for new user', async () => {
    const result = await $fetch('/api/notifications/unread-count', {
      headers: member.headers
    }) as Record<string, unknown>
    expect(result.count).toBe(0)
  })

  describe('member_added notification', () => {
    it('creates notification when member is added to project', async () => {
      await $fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        body: { email: member.email },
        headers: owner.headers
      })

      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      expect(notifications.length).toBe(1)
      expect(notifications[0].type).toBe('member_added')
      expect(notifications[0].message).toContain(project.name)
      expect(notifications[0].linkUrl).toBe(`/projects/${project.slug}`)
      expect(notifications[0].readAt).toBeNull()
      expect(notifications[0].actorName).toBe(owner.name)
    })

    it('updates unread count', async () => {
      const result = await $fetch('/api/notifications/unread-count', {
        headers: member.headers
      }) as Record<string, unknown>
      expect(result.count).toBe(1)
    })
  })

  describe('card_assigned notification', () => {
    it('creates notification when card is assigned on creation', async () => {
      await createTestCard(owner, board.id, statusId, {
        title: 'Test card for assignment',
        assigneeId: member.id
      })

      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const cardNotification = notifications.find(n => n.type === 'card_assigned')
      expect(cardNotification).toBeDefined()
      expect(cardNotification.message).toContain('Test card for assignment')
      expect(cardNotification.linkUrl).toContain(`/projects/${project.slug}/cards/`)
    })

    it('creates notification when card is reassigned', async () => {
      const card = await createTestCard(owner, board.id, statusId, {
        title: 'Reassignment test'
      })

      await $fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        body: { assigneeId: member.id },
        headers: owner.headers
      })

      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const found = notifications.find(n => n.type === 'card_assigned' && n.message.includes('Reassignment test'))
      expect(found).toBeDefined()
    })

    it('does not notify when assigning to self', async () => {
      const beforeNotifications = await $fetch('/api/notifications', {
        headers: owner.headers
      }) as Record<string, unknown>[]
      const beforeCount = beforeNotifications.length

      await createTestCard(owner, board.id, statusId, {
        title: 'Self-assign test',
        assigneeId: owner.id
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: owner.headers
      }) as Record<string, unknown>[]

      expect(afterNotifications.length).toBe(beforeCount)
    })
  })

  describe('role_changed notification', () => {
    it('creates notification when role is changed', async () => {
      await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
        method: 'PATCH',
        body: { role: 'owner' },
        headers: owner.headers
      })

      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const roleNotification = notifications.find(n => n.type === 'role_changed')
      expect(roleNotification).toBeDefined()
      expect(roleNotification.message).toContain('owner')
      expect(roleNotification.linkUrl).toBe(`/projects/${project.slug}`)

      // Revert role for later tests
      await $fetch(`/api/projects/${project.id}/members/${member.id}`, {
        method: 'PATCH',
        body: { role: 'member' },
        headers: owner.headers
      })
    })
  })

  describe('member_removed notification', () => {
    it('creates notification when removed from project', async () => {
      // Create a separate project + member for this test
      const testOwner = await registerTestUser()
      const testMember = await registerTestUser()
      const testProject = await createTestProject(testOwner)

      await $fetch(`/api/projects/${testProject.id}/members`, {
        method: 'POST',
        body: { email: testMember.email },
        headers: testOwner.headers
      })

      await $fetch(`/api/projects/${testProject.id}/members/${testMember.id}`, {
        method: 'DELETE',
        headers: testOwner.headers
      })

      const notifications = await $fetch('/api/notifications', {
        headers: testMember.headers
      }) as Record<string, unknown>[]

      const removedNotification = notifications.find(n => n.type === 'member_removed')
      expect(removedNotification).toBeDefined()
      expect(removedNotification.message).toContain(testProject.name)
      expect(removedNotification.linkUrl).toBeNull()
    })
  })

  describe('mentioned notification', () => {
    it('creates notification when user is mentioned in card description', async () => {
      const beforeNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]
      const beforeCount = beforeNotifications.filter(n => n.type === 'mentioned').length

      await createTestCard(owner, board.id, statusId, {
        title: 'Mention test card',
        description: `Hey @[${member.name}] please check this out`
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const mentionNotifications = afterNotifications.filter(n => n.type === 'mentioned')
      expect(mentionNotifications.length).toBe(beforeCount + 1)
      expect(mentionNotifications[0].message).toContain('mentioned you')
      expect(mentionNotifications[0].message).toContain('Mention test card')
      expect(mentionNotifications[0].linkUrl).toContain(`/projects/${project.slug}/cards/`)
      expect(mentionNotifications[0].actorName).toBe(owner.name)
    })

    it('creates notification when mention is added via description edit', async () => {
      const card = await createTestCard(owner, board.id, statusId, {
        title: 'Edit mention test'
      })

      const beforeNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]
      const beforeCount = beforeNotifications.filter(n => n.type === 'mentioned').length

      await $fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        body: { description: `Adding @[${member.name}] to this card` },
        headers: owner.headers
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const mentionNotifications = afterNotifications.filter(n => n.type === 'mentioned')
      expect(mentionNotifications.length).toBe(beforeCount + 1)
    })

    it('does not create duplicate notification on re-save with same mentions', async () => {
      const desc = `Check with @[${member.name}] on this`
      const card = await createTestCard(owner, board.id, statusId, {
        title: 'No duplicate mention test',
        description: desc
      })

      const afterCreate = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]
      const countAfterCreate = afterCreate.filter(n => n.type === 'mentioned').length

      // Re-save same description
      await $fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        body: { description: desc },
        headers: owner.headers
      })

      const afterResave = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]
      const countAfterResave = afterResave.filter(n => n.type === 'mentioned').length

      expect(countAfterResave).toBe(countAfterCreate)
    })

    it('does not notify when mentioning yourself', async () => {
      const beforeNotifications = await $fetch('/api/notifications', {
        headers: owner.headers
      }) as Record<string, unknown>[]
      const beforeCount = beforeNotifications.filter(n => n.type === 'mentioned').length

      await createTestCard(owner, board.id, statusId, {
        title: 'Self mention test',
        description: `I @[${owner.name}] did this`
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: owner.headers
      }) as Record<string, unknown>[]
      const afterCount = afterNotifications.filter(n => n.type === 'mentioned').length

      expect(afterCount).toBe(beforeCount)
    })

    it('does not notify for non-member mention', async () => {
      const outsider = await registerTestUser()
      const beforeNotifications = await $fetch('/api/notifications', {
        headers: outsider.headers
      }) as Record<string, unknown>[]

      await createTestCard(owner, board.id, statusId, {
        title: 'Non-member mention test',
        description: `Hey @[${outsider.name}] you are not a member`
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: outsider.headers
      }) as Record<string, unknown>[]

      expect(afterNotifications.length).toBe(beforeNotifications.length)
    })
  })

  describe('mark as read', () => {
    it('marks a notification as read', async () => {
      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const unread = notifications.find(n => !n.readAt)
      expect(unread).toBeDefined()

      const result = await $fetch(`/api/notifications/${unread.id}`, {
        method: 'PATCH',
        headers: member.headers
      }) as Record<string, unknown>

      expect(result.ok).toBe(true)

      const updated = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      const readNotification = updated.find(n => n.id === unread.id)
      expect(readNotification.readAt).not.toBeNull()
    })

    it('returns 404 for other user notification', async () => {
      const notifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      if (notifications.length > 0) {
        const res = await fetch(url(`/api/notifications/${notifications[0].id}`), {
          method: 'PATCH',
          headers: owner.headers
        })
        expect(res.status).toBe(404)
      }
    })
  })

  describe('mark all read', () => {
    it('marks all notifications as read', async () => {
      await $fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: member.headers
      })

      const result = await $fetch('/api/notifications/unread-count', {
        headers: member.headers
      }) as Record<string, unknown>

      expect(result.count).toBe(0)
    })
  })

  describe('cleanup', () => {
    it('deletes all read notifications', async () => {
      const beforeNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]
      const readCount = beforeNotifications.filter(n => n.readAt).length
      expect(readCount).toBeGreaterThan(0)

      await $fetch('/api/notifications/cleanup', {
        method: 'DELETE',
        headers: member.headers
      })

      const afterNotifications = await $fetch('/api/notifications', {
        headers: member.headers
      }) as Record<string, unknown>[]

      // All remaining should be unread
      expect(afterNotifications.every(n => !n.readAt)).toBe(true)
      expect(afterNotifications.length).toBeLessThan(beforeNotifications.length)
    })
  })

  describe('auth', () => {
    it('requires auth for list', async () => {
      const res = await fetch(url('/api/notifications'))
      expect(res.status).toBe(401)
    })

    it('requires auth for unread count', async () => {
      const res = await fetch(url('/api/notifications/unread-count'))
      expect(res.status).toBe(401)
    })

    it('requires auth for mark read', async () => {
      const res = await fetch(url('/api/notifications/some-id'), {
        method: 'PATCH'
      })
      expect(res.status).toBe(401)
    })

    it('requires auth for mark all read', async () => {
      const res = await fetch(url('/api/notifications/mark-all-read'), {
        method: 'POST'
      })
      expect(res.status).toBe(401)
    })

    it('requires auth for cleanup', async () => {
      const res = await fetch(url('/api/notifications/cleanup'), {
        method: 'DELETE'
      })
      expect(res.status).toBe(401)
    })
  })
})
