import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'

describe('Board-level column operations', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  it('unlinking a column from a board does not affect other boards', async () => {
    const project = await createTestProject(user, { name: `Unlink Isolation ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'Board 1' })
    const board2 = await createTestBoard(user, project.id, { name: 'Board 2' })

    const full1 = await getBoard(user, board1.id)
    const full2 = await getBoard(user, board2.id)
    expect(full1.columns).toHaveLength(5)
    expect(full2.columns).toHaveLength(5)

    const colToRemove = full1.columns[0]

    await $fetch(`/api/boards/${board1.id}/columns/${colToRemove.id}`, {
      method: 'DELETE',
      headers: user.headers
    })

    const full1After = await getBoard(user, board1.id)
    const full2After = await getBoard(user, board2.id)
    expect(full1After.columns).toHaveLength(4)
    expect(full2After.columns).toHaveLength(5)
    expect(full1After.columns.find((c: any) => c.id === colToRemove.id)).toBeUndefined()
    expect(full2After.columns.find((c: any) => c.id === colToRemove.id)).toBeTruthy()
  })

  it('unlinking a column does not delete the status or its cards', async () => {
    const project = await createTestProject(user, { name: `Unlink Keep Data ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const full = await getBoard(user, board.id)
    const col = full.columns[0]

    await createTestCard(user, board.id, col.id, { title: 'Keep me' })

    await $fetch(`/api/boards/${board.id}/columns/${col.id}`, {
      method: 'DELETE',
      headers: user.headers
    })

    const fullAfter = await getBoard(user, board.id)
    expect(fullAfter.columns.find((c: any) => c.id === col.id)).toBeUndefined()

    // Status should still exist at project level (visible as availableColumn)
    expect(fullAfter.availableColumns).toBeDefined()
    const available = (fullAfter as any).availableColumns as any[]
    expect(available.find((c: any) => c.id === col.id)).toBeTruthy()
  })

  it('links an existing project status to a board', async () => {
    const project = await createTestProject(user, { name: `Link Status ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'Board A' })
    const board2 = await createTestBoard(user, project.id, { name: 'Board B' })

    // Add a column to board1 only
    const newCol = await $fetch(`/api/boards/${board1.id}/columns`, {
      method: 'POST',
      body: { name: 'Board1 Only', color: '#f97316' },
      headers: user.headers
    }) as any

    const full2Before = await getBoard(user, board2.id)
    expect(full2Before.columns.find((c: any) => c.id === newCol.id)).toBeUndefined()
    expect((full2Before as any).availableColumns.find((c: any) => c.id === newCol.id)).toBeTruthy()

    // Link it to board2
    const linked = await $fetch(`/api/boards/${board2.id}/columns/link`, {
      method: 'POST',
      body: { statusId: newCol.id },
      headers: user.headers
    }) as any

    expect(linked.id).toBe(newCol.id)
    expect(linked.name).toBe('Board1 Only')

    const full2After = await getBoard(user, board2.id)
    expect(full2After.columns.find((c: any) => c.id === newCol.id)).toBeTruthy()
    expect((full2After as any).availableColumns.find((c: any) => c.id === newCol.id)).toBeUndefined()
  })

  it('rejects linking a column already on the board', async () => {
    const project = await createTestProject(user, { name: `Duplicate Link ${Date.now()}` })
    const board = await createTestBoard(user, project.id)
    const full = await getBoard(user, board.id)

    await expectError($fetch(`/api/boards/${board.id}/columns/link`, {
      method: 'POST',
      body: { statusId: full.columns[0].id },
      headers: user.headers
    }), 409)
  })

  it('project-level status creation does not link to any boards', async () => {
    const project = await createTestProject(user, { name: `Project Col ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'PB1' })
    const board2 = await createTestBoard(user, project.id, { name: 'PB2' })

    await $fetch(`/api/projects/${project.id}/statuses`, {
      method: 'POST',
      body: { name: 'Project Wide', color: '#06b6d4' },
      headers: user.headers
    })

    const full1 = await getBoard(user, board1.id)
    const full2 = await getBoard(user, board2.id)
    expect(full1.columns.find((c: any) => c.name === 'Project Wide')).toBeUndefined()
    expect(full2.columns.find((c: any) => c.name === 'Project Wide')).toBeUndefined()

    // Status should appear in availableColumns for both boards
    expect((full1 as any).availableColumns.find((c: any) => c.name === 'Project Wide')).toBeTruthy()
    expect((full2 as any).availableColumns.find((c: any) => c.name === 'Project Wide')).toBeTruthy()
  })

  it('returns availableColumns in board GET response', async () => {
    const project = await createTestProject(user, { name: `Available Cols ${Date.now()}` })
    const board1 = await createTestBoard(user, project.id, { name: 'AB1' })
    const board2 = await createTestBoard(user, project.id, { name: 'AB2' })

    // Add column only to board1
    await $fetch(`/api/boards/${board1.id}/columns`, {
      method: 'POST',
      body: { name: 'Only In Board1' },
      headers: user.headers
    })

    const full2 = await getBoard(user, board2.id) as any
    expect(full2.availableColumns).toBeDefined()
    expect(full2.availableColumns.find((c: any) => c.name === 'Only In Board1')).toBeTruthy()

    const full1 = await getBoard(user, board1.id) as any
    expect(full1.availableColumns.find((c: any) => c.name === 'Only In Board1')).toBeUndefined()
  })

  it('board GET includes createdBy info', async () => {
    const project = await createTestProject(user, { name: `Creator Info ${Date.now()}` })
    const board = await createTestBoard(user, project.id, { name: 'With Creator' })
    const full = await getBoard(user, board.id) as any

    expect(full.createdBy).toBeTruthy()
    expect(full.createdBy.id).toBe(user.id)
    expect(full.createdBy.name).toBe(user.name)
    expect(full.role).toBe('owner')
  })
})

describe('Board column access authorization', async () => {
  let owner: TestUser
  let member: TestUser
  let admin: TestUser

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    admin = await createAdminUser()
  })

  it('board creator (project owner) can add columns to board', async () => {
    const project = await createTestProject(owner, { name: `Auth Add Col ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    // Add member to project
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const newCol = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Owner Column', color: '#3b82f6' },
      headers: owner.headers
    }) as any

    expect(newCol.name).toBe('Owner Column')
  })

  it('regular member cannot add columns to a board they did not create', async () => {
    const project = await createTestProject(owner, { name: `Auth Reject Add ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    await expectError($fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Member Column' },
      headers: member.headers
    }), 403)
  })

  it('regular member cannot unlink columns from a board they did not create', async () => {
    const project = await createTestProject(owner, { name: `Auth Reject Unlink ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const full = await getBoard(owner, board.id)
    const col = full.columns[0]

    await expectError($fetch(`/api/boards/${board.id}/columns/${col.id}`, {
      method: 'DELETE',
      headers: member.headers
    }), 403)
  })

  it('regular member cannot reorder columns on a board they did not create', async () => {
    const project = await createTestProject(owner, { name: `Auth Reject Reorder ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const full = await getBoard(owner, board.id)

    await expectError($fetch(`/api/boards/${board.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: full.columns.map((c: any, i: number) => ({ id: c.id, position: i })) },
      headers: member.headers
    }), 403)
  })

  it('regular member cannot link columns to a board they did not create', async () => {
    const project = await createTestProject(owner, { name: `Auth Reject Link ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    // Create an extra status at project level, then unlink it from the board
    await $fetch(`/api/projects/${project.id}/statuses`, {
      method: 'POST',
      body: { name: 'Extra Col' },
      headers: owner.headers
    })

    const full = await getBoard(owner, board.id) as any
    const colToUnlink = full.columns[full.columns.length - 1]
    await $fetch(`/api/boards/${board.id}/columns/${colToUnlink.id}`, {
      method: 'DELETE',
      headers: owner.headers
    })

    await expectError($fetch(`/api/boards/${board.id}/columns/link`, {
      method: 'POST',
      body: { statusId: colToUnlink.id },
      headers: member.headers
    }), 403)
  })

  it('board creator can link/unlink/reorder columns even if not project owner', async () => {
    const project = await createTestProject(owner, { name: `Board Creator Auth ${Date.now()}` })

    // Add member to project first
    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    // Member creates the board — they are the board creator
    const board = await createTestBoard(member, project.id, { name: 'Member Board' })
    const full = await getBoard(member, board.id)

    // Board creator can reorder
    const reorderResult = await $fetch(`/api/boards/${board.id}/columns/reorder`, {
      method: 'PUT',
      body: { columns: full.columns.map((c: any, i: number) => ({ id: c.id, position: full.columns.length - 1 - i })) },
      headers: member.headers
    }) as any
    expect(reorderResult.ok).toBe(true)

    // Board creator can unlink
    const colToUnlink = full.columns[0]
    await $fetch(`/api/boards/${board.id}/columns/${colToUnlink.id}`, {
      method: 'DELETE',
      headers: member.headers
    })

    // Board creator can link it back
    const linked = await $fetch(`/api/boards/${board.id}/columns/link`, {
      method: 'POST',
      body: { statusId: colToUnlink.id },
      headers: member.headers
    }) as any
    expect(linked.id).toBe(colToUnlink.id)
  })

  it('board creator can create new columns on their board', async () => {
    const project = await createTestProject(owner, { name: `Creator Add ${Date.now()}` })

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const board = await createTestBoard(member, project.id, { name: 'Member Board NC' })

    const col = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Creator Column', color: '#ff0000' },
      headers: member.headers
    }) as any

    expect(col.name).toBe('Creator Column')
  })

  it('project owner can configure columns on any board', async () => {
    const project = await createTestProject(owner, { name: `Owner Override ${Date.now()}` })

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    // Member creates the board
    const board = await createTestBoard(member, project.id, { name: 'Member Board 2' })

    // Owner (not board creator) can still add columns
    const newCol = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Owner Override Col' },
      headers: owner.headers
    }) as any

    expect(newCol.name).toBe('Owner Override Col')
  })

  it('admin can configure columns on any board', async () => {
    const project = await createTestProject(owner, { name: `Admin Override ${Date.now()}` })
    const board = await createTestBoard(owner, project.id, { name: 'Admin Test Board' })

    const newCol = await $fetch(`/api/boards/${board.id}/columns`, {
      method: 'POST',
      body: { name: 'Admin Column' },
      headers: admin.headers
    }) as any

    expect(newCol.name).toBe('Admin Column')
  })

  it('regular member cannot update project-level statuses', async () => {
    const project = await createTestProject(owner, { name: `Col Update Auth ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const full = await getBoard(owner, board.id)
    const col = full.columns[0]

    await expectError($fetch(`/api/statuses/${col.id}`, {
      method: 'PUT',
      body: { name: 'Renamed' },
      headers: member.headers
    }), 403)
  })

  it('regular member cannot delete project-level statuses', async () => {
    const project = await createTestProject(owner, { name: `Col Delete Auth ${Date.now()}` })
    const board = await createTestBoard(owner, project.id)

    await $fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      body: { email: member.email },
      headers: owner.headers
    })

    const full = await getBoard(owner, board.id)
    const col = full.columns[0]

    await expectError($fetch(`/api/statuses/${col.id}`, {
      method: 'DELETE',
      headers: member.headers
    }), 403)
  })
})
