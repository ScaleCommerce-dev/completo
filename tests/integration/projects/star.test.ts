import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'
import { addMember } from '../../setup/agents'

type ListedProject = { id: string, name: string, starred: boolean, role: string }

async function listed(user: TestUser) {
  return await $fetch('/api/projects', { headers: user.headers }) as ListedProject[]
}

async function star(user: TestUser, projectId: string) {
  return await $fetch(`/api/projects/${projectId}/star`, { method: 'PUT', headers: user.headers })
}

async function unstar(user: TestUser, projectId: string) {
  return await $fetch(`/api/projects/${projectId}/star`, { method: 'DELETE', headers: user.headers })
}

describe('project stars', () => {
  let owner: TestUser
  let member: TestUser
  let outsider: TestUser
  let admin: TestUser
  let project: Awaited<ReturnType<typeof createTestProject>>

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    outsider = await registerTestUser()
    admin = await createAdminUser()
    project = await createTestProject(owner)
    await addMember(owner, project.id, member.id)
  })

  it('starts unstarred, and a member can star and unstar', async () => {
    expect((await listed(member)).find(p => p.id === project.id)?.starred).toBe(false)

    expect(await star(member, project.id)).toEqual({ starred: true })
    expect((await listed(member)).find(p => p.id === project.id)?.starred).toBe(true)
    const detail = await $fetch(`/api/projects/${project.slug}`, { headers: member.headers }) as { starred: boolean, isMember: boolean }
    expect(detail).toMatchObject({ starred: true, isMember: true })

    expect(await unstar(member, project.id)).toEqual({ starred: false })
    expect((await listed(member)).find(p => p.id === project.id)?.starred).toBe(false)
  })

  it('is idempotent in both directions', async () => {
    await star(member, project.id)
    await star(member, project.id)
    expect((await listed(member)).find(p => p.id === project.id)?.starred).toBe(true)

    await unstar(member, project.id)
    await unstar(member, project.id)
    expect((await listed(member)).find(p => p.id === project.id)?.starred).toBe(false)
  })

  it('is per person: one member starring does not star it for another', async () => {
    await star(member, project.id)
    expect((await listed(owner)).find(p => p.id === project.id)?.starred).toBe(false)
    await unstar(member, project.id)
  })

  it('accepts the slug as well as the id', async () => {
    await star(owner, project.slug)
    expect((await listed(owner)).find(p => p.id === project.id)?.starred).toBe(true)
    await unstar(owner, project.slug)
  })

  it('hides the project from a non-member with 404', async () => {
    await expectError(star(outsider, project.id), 404)
    await expectError(unstar(outsider, project.id), 404)
  })

  it('refuses an admin who is not a member with 403, and never reports one as starred', async () => {
    await expectError(star(admin, project.id), 403)

    const row = (await listed(admin)).find(p => p.id === project.id)
    expect(row).toMatchObject({ role: 'admin', starred: false })
    const detail = await $fetch(`/api/projects/${project.id}`, { headers: admin.headers }) as { starred: boolean, isMember: boolean }
    expect(detail).toMatchObject({ starred: false, isMember: false })
  })

  it('stops counting a star once its owner leaves the project', async () => {
    // An admin, so the project stays visible after removal: the read has to
    // check membership, not just find the row that was left behind.
    const p = await createTestProject(owner)
    await addMember(owner, p.id, admin.id)
    await star(admin, p.id)
    expect((await listed(admin)).find(x => x.id === p.id)?.starred).toBe(true)

    await $fetch(`/api/projects/${p.id}/members/${admin.id}`, { method: 'DELETE', headers: owner.headers })

    expect((await listed(admin)).find(x => x.id === p.id)).toMatchObject({ role: 'admin', starred: false })
    const detail = await $fetch(`/api/projects/${p.id}`, { headers: admin.headers }) as { starred: boolean }
    expect(detail.starred).toBe(false)
  })

  it('lists projects alphabetically, ignoring case and reading numbers as numbers', async () => {
    // Insertion order is deliberately not the answer, and a plain `<` sort
    // would put every lower-case name after every capitalised one.
    const sorter = await registerTestUser()
    const tag = Math.random().toString(36).slice(2, 6)
    for (const name of ['zeta', 'Alpha', 'beta', 'Gamma 10', 'Gamma 9']) {
      await createTestProject(sorter, { name: `${name} ${tag}` })
    }
    expect((await listed(sorter)).map(p => p.name)).toEqual(
      ['Alpha', 'beta', 'Gamma 9', 'Gamma 10', 'zeta'].map(n => `${n} ${tag}`)
    )
  })
})
