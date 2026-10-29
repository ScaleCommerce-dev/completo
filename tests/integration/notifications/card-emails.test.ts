import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard, createTestComment, mention } from '../../setup/fixtures'

interface SentCardEmail { to: string, userId: string, kind: 'assigned' | 'mentioned', cardId: number, subject: string, text: string }

/**
 * Integration tests run with SMTP disabled, so these read the test-only outbox
 * (/api/_test/card-emails) that records what sendCardActivityEmails would send.
 * That covers the part the unit tests cannot: that each call site hands the right
 * people to the email layer, and that the exit guard drops everyone it should.
 */
describe('Card activity emails', () => {
  let owner: TestUser
  let member: TestUser
  let second: TestUser
  let outsider: TestUser
  let project: Record<string, unknown>
  let statusId: string

  const sent = () => $fetch('/api/_test/card-emails?clear=1') as Promise<SentCardEmail[]>
  const updateCard = (user: TestUser, cardId: number, body: Record<string, unknown>) =>
    $fetch(`/api/cards/${cardId}`, { method: 'PUT', body, headers: user.headers })
  const setEmails = (user: TestUser, on: boolean) =>
    $fetch('/api/user/profile', { method: 'PUT', body: { emailNotifications: on }, headers: user.headers })

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    second = await registerTestUser()
    outsider = await registerTestUser()
    project = await createTestProject(owner)
    for (const user of [member, second]) {
      await $fetch(`/api/projects/${project.id}/members`, { method: 'POST', body: { userId: user.id }, headers: owner.headers })
    }
    const board = await createTestBoard(owner, project.id as string)
    statusId = (await getBoard(owner, board.id as string)).columns[0].id
  })

  beforeEach(async () => {
    await sent() // start every test with an empty outbox
  })

  it('emails a member assigned on card creation, in English by default', async () => {
    const card = await createTestCard(owner, project.id as string, statusId, { title: 'Ship it', assigneeId: member.id })
    expect(await sent()).toEqual([
      expect.objectContaining({ to: member.email, kind: 'assigned', cardId: card.id, subject: `[Completo] ${owner.name} assigned you a card: Ship it` })
    ])
  })

  it('does not email someone who assigns a card to themselves', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    await updateCard(owner, card.id, { assigneeId: owner.id })
    expect(await sent()).toEqual([])
  })

  it('does not email on an edit that does not change the assignee', async () => {
    const card = await createTestCard(owner, project.id as string, statusId, { assigneeId: member.id })
    await sent()
    await updateCard(owner, card.id, { title: 'Renamed' })
    await updateCard(owner, card.id, { assigneeId: member.id })
    expect(await sent()).toEqual([])
  })

  it('emails a newly mentioned member once, and not again when the text is re-saved', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    const description = `Please look at this ${mention(member)}`
    await updateCard(owner, card.id, { description })
    expect(await sent()).toEqual([expect.objectContaining({ to: member.email, kind: 'mentioned', cardId: card.id })])

    await updateCard(owner, card.id, { description: `${description} — thanks!` })
    expect(await sent()).toEqual([])
  })

  it('sends one email to someone assigned and mentioned in the same save', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    await updateCard(owner, card.id, { assigneeId: member.id, description: `Over to you ${mention(member)}` })
    expect(await sent()).toEqual([expect.objectContaining({ to: member.email, kind: 'assigned' })])
  })

  it('emails a member mentioned in a comment, with the comment as excerpt', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    await createTestComment(owner, card.id, `${mention(second)} can you check the copy?`)
    const emails = await sent()
    expect(emails).toEqual([expect.objectContaining({ to: second.email, kind: 'mentioned' })])
    expect(emails[0]!.text).toContain('can you check the copy?')
  })

  it('never emails someone who is not a member of the project', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    await createTestComment(owner, card.id, `Secret: ${mention(outsider)} should not see this`)
    expect(await sent()).toEqual([])
  })

  it('respects the profile opt-out', async () => {
    await setEmails(member, false)
    try {
      await createTestCard(owner, project.id as string, statusId, { assigneeId: member.id })
      expect(await sent()).toEqual([])
    } finally {
      await setEmails(member, true)
    }
  })

  it('reports the opt-out on the profile', async () => {
    await setEmails(second, false)
    const profile = await $fetch('/api/user/profile', { headers: second.headers }) as { emailNotifications: boolean }
    expect(profile.emailNotifications).toBe(false)
    await setEmails(second, true)
  })

  it('does not re-email a mention removed and re-added on the same card within the cooldown', async () => {
    const card = await createTestCard(owner, project.id as string, statusId)
    await updateCard(owner, card.id, { description: `Hi ${mention(member)}` })
    await updateCard(owner, card.id, { description: 'Hi' })
    await updateCard(owner, card.id, { description: `Hi again ${mention(member)}` })
    expect((await sent()).filter(e => e.to === member.email)).toHaveLength(1)
  })

  describe('exit guard', () => {
    const recipients = (userIds: string[]) =>
      $fetch('/api/_test/card-email-recipients', { method: 'POST', body: { projectId: project.id, userIds } }) as Promise<Record<string, string>>

    it('drops a non-member even when a caller hands one in', async () => {
      expect(await recipients([member.id, outsider.id])).toEqual({ [member.id]: member.email })
    })

    it('drops a member who turned card emails off', async () => {
      await setEmails(second, false)
      try {
        expect(await recipients([member.id, second.id])).toEqual({ [member.id]: member.email })
      } finally {
        await setEmails(second, true)
      }
    })
  })
})
