import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../../setup/server'
import { registerTestUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestCard } from '../../setup/fixtures'

/**
 * The counters the sidebar, the projects grid and the profile show. They are
 * counted in SQL now rather than by loading every card, so these pin the
 * numbers, including the cases the SQL has to spell differently from the
 * JavaScript it replaced: a project without a done status, and the timestamp
 * unit.
 */

interface ListedProject { id: string, totalCards: number, openCards: number, lastActivity: string | null }
interface Detail { doneStatusId: string, statuses: Array<{ id: string, cardCount: number }>, totalCards: number, openCards: number, lists: Array<{ cardCount: number }> }

describe('project card counters', () => {
  let user: TestUser

  beforeAll(async () => {
    user = await registerTestUser()
  })

  async function setup() {
    const project = await createTestProject(user)
    const detail = await $fetch<Detail>(`/api/projects/${project.id}`, { headers: user.headers })
    const open = detail.statuses.find(s => s.id !== detail.doneStatusId)!.id
    return { project, open, done: detail.doneStatusId }
  }

  const listed = async (id: string) =>
    (await $fetch<ListedProject[]>('/api/projects', { headers: user.headers })).find(p => p.id === id)!

  it('counts every card and the ones not done, on the list and the detail', async () => {
    const { project, open, done } = await setup()
    await createTestCard(user, project.id, open)
    await createTestCard(user, project.id, open)
    await createTestCard(user, project.id, done)

    expect(await listed(project.id)).toMatchObject({ totalCards: 3, openCards: 2 })
    const detail = await $fetch<Detail>(`/api/projects/${project.id}`, { headers: user.headers })
    expect(detail).toMatchObject({ totalCards: 3, openCards: 2 })
    expect(detail.statuses.find(s => s.id === open)!.cardCount).toBe(2)
    expect(detail.statuses.find(s => s.id === done)!.cardCount).toBe(1)
    expect(detail.lists.every(l => l.cardCount === 2)).toBe(true)
  })

  it('counts every card as open in a project without a done status', async () => {
    // `statusId != NULL` is never true in SQL, which would have counted nothing.
    const { project, open, done } = await setup()
    await createTestCard(user, project.id, open)
    await createTestCard(user, project.id, done)
    await $fetch(`/api/projects/${project.id}`, { method: 'PUT', body: { doneStatusId: null }, headers: user.headers })

    expect(await listed(project.id)).toMatchObject({ totalCards: 2, openCards: 2 })
    const profile = await $fetch<{ projects: Array<{ id: string, openCards: number }> }>('/api/user/profile', { headers: user.headers })
    expect(profile.projects.find(p => p.id === project.id)!.openCards).toBe(2)
  })

  it('reports the latest card change as an ISO time, and none for an empty project', async () => {
    const { project, open } = await setup()
    expect((await listed(project.id)).lastActivity).toBeNull()

    const before = Date.now()
    await createTestCard(user, project.id, open)
    const at = new Date((await listed(project.id)).lastActivity!).getTime()
    // Seconds stored, so within a second of now, and not 1970 (a unit slip).
    expect(Math.abs(at - before)).toBeLessThan(5000)
  })
})
