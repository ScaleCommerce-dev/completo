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

  it('lets an admin who is not a member star it, and reports it starred', async () => {
    // Admins see every project; one they look after without being in it belongs
    // in their sidebar as much as their own.
    const p = await createTestProject(owner)
    expect(await star(admin, p.id)).toEqual({ starred: true })

    expect((await listed(admin)).find(x => x.id === p.id)).toMatchObject({ role: 'admin', starred: true })
    const detail = await $fetch(`/api/projects/${p.id}`, { headers: admin.headers }) as { starred: boolean, isMember: boolean }
    expect(detail).toMatchObject({ starred: true, isMember: false })

    expect(await unstar(admin, p.id)).toEqual({ starred: false })
    expect((await listed(admin)).find(x => x.id === p.id)?.starred).toBe(false)
  })

  it('keeps an admin\'s star after they leave the project, since they still see it', async () => {
    const p = await createTestProject(owner)
    await addMember(owner, p.id, admin.id)
    await star(admin, p.id)
    await $fetch(`/api/projects/${p.id}/members/${admin.id}`, { method: 'DELETE', headers: owner.headers })

    expect((await listed(admin)).find(x => x.id === p.id)).toMatchObject({ role: 'admin', starred: true })
  })

  it('stops counting a star once its owner can no longer see the project', async () => {
    // A star on a project the person was removed from, or starred as an admin who
    // is no longer one, is left in the table; the read must not count it.
    const removed = await createAdminUser()
    const p = await createTestProject(owner)
    await addMember(owner, p.id, removed.id)
    await star(removed, p.id)
    const q = await createTestProject(owner)
    await star(removed, q.id)

    await $fetch(`/api/projects/${p.id}/members/${removed.id}`, { method: 'DELETE', headers: owner.headers })
    await $fetch(`/api/admin/users/${removed.id}`, { method: 'PATCH', body: { isAdmin: false }, headers: admin.headers })

    const ids = (await listed(removed)).map(x => x.id)
    expect(ids).not.toContain(p.id)
    expect(ids).not.toContain(q.id)
    await expectError($fetch(`/api/projects/${q.id}`, { headers: removed.headers }), 404)

    // The row was kept on purpose, so re-admitted as a member they find it starred again.
    await addMember(owner, p.id, removed.id)
    expect((await listed(removed)).find(x => x.id === p.id)?.starred).toBe(true)
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
