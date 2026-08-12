import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, getBoard } from '../../setup/fixtures'

/**
 * NOTE: as with generate-description, nothing here reaches streamAiResponse — AI
 * calls cost money and hitting providers without keys risks getting blocked. These
 * cover auth, validation and scope filtering, all of which run before streaming.
 *
 * The test DB is built with `drizzle-kit push`, so migration 0003's default comment
 * skills do not exist here; tests create the skills they need.
 */
describe('AI comment support', () => {
  let user: TestUser
  let admin: TestUser
  let outsider: TestUser
  let projectId: string
  let cardId: number
  let commentSkillId: string
  let cardSkillId: string

  beforeAll(async () => {
    user = await registerTestUser()
    admin = await createAdminUser()
    outsider = await registerTestUser()

    const project = await createTestProject(user)
    projectId = project.id
    const board = await createTestBoard(user, projectId)
    const fullBoard = await getBoard(user, board.id)
    const card = await createTestCard(user, projectId, fullBoard.columns[0]!.id, { title: 'AI comment card' })
    cardId = card.id

    const commentSkill = await $fetch('/api/admin/skills', {
      method: 'POST',
      body: { name: `Comment skill ${Date.now()}`, prompt: 'Fix: {comment}', scope: 'comment' },
      headers: admin.headers
    }) as { id: string }
    commentSkillId = commentSkill.id

    const cardSkill = await $fetch('/api/admin/skills', {
      method: 'POST',
      body: { name: `Card skill ${Date.now()}`, prompt: 'Describe: {title}', scope: 'card' },
      headers: admin.headers
    }) as { id: string }
    cardSkillId = cardSkill.id
  })

  describe('skill scopes', () => {
    it('accepts the comment scope when creating a skill', async () => {
      const skill = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: `Another comment skill ${Date.now()}`, prompt: '{comment}', scope: 'comment' },
        headers: admin.headers
      }) as { scope: string }

      expect(skill.scope).toBe('comment')
    })

    it('rejects an unknown scope', async () => {
      await expectError($fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: 'Bad scope', prompt: 'x', scope: 'nonsense' },
        headers: admin.headers
      }), 400)

      await expectError($fetch('/api/skills', {
        query: { scope: 'nonsense' },
        headers: user.headers
      }), 400)
    })

    it('returns only comment skills for scope=comment', async () => {
      const skills = await $fetch('/api/skills', {
        query: { scope: 'comment' },
        headers: user.headers
      }) as Array<{ id: string, scope: string }>

      expect(skills.length).toBeGreaterThan(0)
      expect(skills.every(s => s.scope === 'comment')).toBe(true)
      expect(skills.find(s => s.id === commentSkillId)).toBeDefined()
      expect(skills.find(s => s.id === cardSkillId)).toBeUndefined()
    })

    it('keeps card skills out of the comment list and vice versa', async () => {
      const cardSkills = await $fetch('/api/skills', {
        query: { scope: 'card' },
        headers: user.headers
      }) as Array<{ id: string, scope: string }>

      expect(cardSkills.every(s => s.scope === 'card')).toBe(true)
      expect(cardSkills.find(s => s.id === commentSkillId)).toBeUndefined()
    })
  })

  describe('POST /api/cards/[id]/ai/comment', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await fetch(url(`/api/cards/${cardId}/ai/comment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'draft', skillId: commentSkillId })
      })

      expect(res.status).toBe(401)
    })

    it('hides the card from non-members with 404', async () => {
      const res = await fetch(url(`/api/cards/${cardId}/ai/comment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...outsider.headers },
        body: JSON.stringify({ body: 'draft', skillId: commentSkillId })
      })

      expect(res.status).toBe(404)
    })

    it('requires a comment body', async () => {
      await expectError($fetch(`/api/cards/${cardId}/ai/comment`, {
        method: 'POST',
        body: { skillId: commentSkillId },
        headers: user.headers
      }), 400)

      await expectError($fetch(`/api/cards/${cardId}/ai/comment`, {
        method: 'POST',
        body: { body: '   ', skillId: commentSkillId },
        headers: user.headers
      }), 400)
    })

    it('requires either a skill or a prompt', async () => {
      await expectError($fetch(`/api/cards/${cardId}/ai/comment`, {
        method: 'POST',
        body: { body: 'draft' },
        headers: user.headers
      }), 400)
    })

    it('rejects an unknown skill', async () => {
      await expectError($fetch(`/api/cards/${cardId}/ai/comment`, {
        method: 'POST',
        body: { body: 'draft', skillId: 'does-not-exist' },
        headers: user.headers
      }), 404)
    })

    it('refuses a card skill on the comment endpoint', async () => {
      // Card prompts interpolate card placeholders and would produce a description,
      // so using one here is a client bug rather than something to silently accept.
      await expectError($fetch(`/api/cards/${cardId}/ai/comment`, {
        method: 'POST',
        body: { body: 'draft', skillId: cardSkillId },
        headers: user.headers
      }), 400)
    })

    it('404s for a card that does not exist', async () => {
      const res = await fetch(url('/api/cards/99999999/ai/comment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...user.headers },
        body: JSON.stringify({ body: 'draft', skillId: commentSkillId })
      })

      expect(res.status).toBe(404)
    })
  })
})
