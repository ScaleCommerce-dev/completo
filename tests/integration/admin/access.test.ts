import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

describe('Admin access', async () => {
  let admin: TestUser
  let regularUser: TestUser
  let stranger: TestUser
  let project: { id: string; name: string; slug: string; key: string }
  let board: { id: string; name: string; slug: string; projectId: string }
  let fullBoard: Awaited<ReturnType<typeof getBoard>>
  let card: { id: number; statusId: string; projectId: string }

  beforeAll(async () => {
    admin = await createAdminUser()
    regularUser = await registerTestUser()
    stranger = await registerTestUser()

    // regularUser creates a project — admin is NOT a member
    project = await createTestProject(regularUser)
    board = await createTestBoard(regularUser, project.id)
    fullBoard = await getBoard(regularUser, board.id)
    card = await createTestCard(regularUser, board.id, fullBoard.columns[0].id, {
      title: 'Admin Test Card',
      assigneeId: regularUser.id
    })
  })

  it('admin can list all projects including non-member ones', async () => {
    const projects = await $fetch('/api/projects', {
      headers: admin.headers
    }) as any[]
    const found = projects.find((p: any) => p.id === project.id)
    expect(found).toBeDefined()
    expect(found.role).toBe('admin')
  })

  it('admin can view a project they are not a member of', async () => {
    const res = await $fetch(`/api/projects/${project.id}`, {
      headers: admin.headers
    }) as any
    expect(res.id).toBe(project.id)
  })

  it('admin can update a project they are not a member of', async () => {
    const res = await $fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: { name: project.name },
      headers: admin.headers
    }) as any
    expect(res.id).toBe(project.id)
  })

  it('admin can delete a project they are not a member of', async () => {
    // Create a disposable project for delete test
    const tempProject = await createTestProject(regularUser)
    const res = await $fetch(`/api/projects/${tempProject.id}`, {
      method: 'DELETE',
      headers: admin.headers
    }) as any
    expect(res.ok).toBe(true)
  })

  it('admin can view a board on a non-member project', async () => {
    const res = await $fetch(`/api/boards/${board.id}`, {
      headers: admin.headers
    }) as any
    expect(res.id).toBe(board.id)
    expect(res.columns.length).toBeGreaterThan(0)
  })

  it('admin can create cards on non-member projects', async () => {
    const res = await $fetch(`/api/boards/${board.id}/cards`, {
      method: 'POST',
      body: { statusId: fullBoard.columns[0].id, title: 'Admin Created Card' },
      headers: admin.headers
    }) as any
    expect(res.title).toBe('Admin Created Card')
  })

  it('admin can manage members (owner-level action) on non-member projects', async () => {
    const extra = await registerTestUser()
    const res = await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: extra.email },
      headers: admin.headers
    }) as any
    // Uniform response — no user existence leak
    expect(res.added).toBe(true)

    // Verify the member was actually added
    const members = await $fetch(`/api/projects/${project.id}/members`, {
      headers: admin.headers
    }) as any[]
    const found = members.find((m: any) => m.id === extra.id)
    expect(found).toBeDefined()

    // Clean up: remove the added member
    await $fetch(`/api/projects/${project.id}/members/${extra.id}`, {
      method: 'DELETE',
      headers: admin.headers
    })
  })

  it('admin my-tasks only returns their own assigned cards', async () => {
    const data = await $fetch('/api/my-tasks', {
      headers: admin.headers
    }) as any
    // Admin has no cards assigned to them in this project
    const projectGroup = data.groups.find((g: any) => g.project?.id === project.id)
    expect(projectGroup).toBeUndefined()
  })

  it('non-admin stranger still gets 404', async () => {
    const res = await fetch(url(`/api/projects/${project.id}`), {
      headers: stranger.headers
    })
    expect(res.status).toBe(404)
  })
})
