import { $fetch, url } from './server'
import type { TestUser } from './auth'

let boardCounter = 0

let keyCounter = 0

function randomKey(): string {
  keyCounter++
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let key = ''
  let n = keyCounter
  for (let i = 0; i < 2; i++) {
    key += chars[n % 26]
    n = Math.floor(n / 26)
  }
  for (let i = 0; i < 3; i++) {
    key += chars[Math.floor(Math.random() * 26)]
  }
  return key
}

export async function createTestProject(user: TestUser, overrides?: { name?: string, key?: string, slug?: string, description?: string }) {
  const name = overrides?.name || `Test Project ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const key = overrides?.key || randomKey()

  const project = await $fetch('/api/projects', {
    method: 'POST',
    body: {
      name,
      key,
      slug: overrides?.slug,
      description: overrides?.description
    },
    headers: user.headers
  })

  return project as { id: string, name: string, slug: string, key: string, description: string | null }
}

export async function createTestBoard(user: TestUser, projectId: string, overrides?: { name?: string, slug?: string }) {
  boardCounter++
  const name = overrides?.name || `Test Board ${boardCounter}`

  const board = await $fetch(`/api/projects/${projectId}/boards`, {
    method: 'POST',
    body: { name, slug: overrides?.slug },
    headers: user.headers
  })

  return board as { id: string, name: string, slug: string, projectId: string, position: number }
}

export async function getBoard(user: TestUser, boardIdOrSlug: string) {
  return await $fetch(`/api/boards/${boardIdOrSlug}`, {
    headers: user.headers
  }) as {
    id: string
    name: string
    slug: string
    projectId: string
    project: { id: string, name: string, slug: string, key: string }
    columns: Array<{ id: string, name: string, color: string | null, position: number }>
    cards: Array<{ id: number, title: string, statusId: string, position: number, priority: string, assignee: unknown }>
    members: Array<{ id: string, name: string }>
  }
}

export async function createTestTag(user: TestUser, projectId: string, overrides?: { name?: string, color?: string }) {
  const name = overrides?.name || `Tag ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  return await $fetch(`/api/projects/${projectId}/tags`, {
    method: 'POST',
    body: { name, color: overrides?.color || '#6366f1' },
    headers: user.headers
  }) as { id: string, projectId: string, name: string, color: string }
}

export async function setCardTags(user: TestUser, cardId: number, tagIds: string[]) {
  return await $fetch(`/api/cards/${cardId}/tags`, {
    method: 'PUT',
    body: { tagIds },
    headers: user.headers
  }) as { tags: Array<{ id: string, name: string, color: string }> }
}

let listCounter = 0

export async function createTestList(user: TestUser, projectId: string, overrides?: { name?: string, slug?: string, columns?: string[] }) {
  listCounter++
  const name = overrides?.name || `Test List ${listCounter}`

  const list = await $fetch(`/api/projects/${projectId}/lists`, {
    method: 'POST',
    body: { name, slug: overrides?.slug, columns: overrides?.columns },
    headers: user.headers
  })

  return list as { id: string, name: string, slug: string, projectId: string, position: number }
}

export async function getList(user: TestUser, listIdOrSlug: string, opts?: { projectSlug?: string }) {
  const params = opts?.projectSlug ? { projectSlug: opts.projectSlug } : undefined
  return await $fetch(`/api/lists/${listIdOrSlug}`, {
    headers: user.headers,
    params
  }) as {
    id: string
    name: string
    slug: string
    projectId: string
    project: { id: string, name: string, slug: string, key: string, doneStatusId: string | null, doneRetentionDays: number | null }
    columns: Array<{ id: string, field: string, position: number }>
    cards: Array<{ id: number, title: string, statusId: string, position: number, priority: string, assignee: unknown, status: { id: string, name: string, color: string | null } | null, tags: unknown[] }>
    members: Array<{ id: string, name: string }>
    statuses: Array<{ id: string, name: string, color: string | null }>
    tags: Array<{ id: string, name: string, color: string }>
  }
}

export async function createInvitation(user: TestUser, projectId: string, email: string) {
  return await $fetch(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: { email },
    headers: user.headers
  }) as { invited: boolean, email?: string, id?: string, name?: string, role?: string }
}

export async function createTestCard(user: TestUser, boardId: string, statusId: string, overrides?: { title?: string, description?: string, priority?: string, assigneeId?: string, dueDate?: string }) {
  const title = overrides?.title || `Test Card ${Date.now()}`

  return await $fetch(`/api/boards/${boardId}/cards`, {
    method: 'POST',
    body: {
      statusId,
      title,
      description: overrides?.description,
      priority: overrides?.priority,
      assigneeId: overrides?.assigneeId,
      dueDate: overrides?.dueDate
    },
    headers: user.headers
  }) as { id: number, title: string, statusId: string, projectId: string, position: number, priority: string, dueDate: string | null }
}

export async function uploadAttachment(
  user: TestUser,
  cardId: number,
  overrides?: { filename?: string, content?: string, mimeType?: string }
) {
  const filename = overrides?.filename || 'test.txt'
  const content = overrides?.content || 'test file content'
  const mimeType = overrides?.mimeType || 'text/plain'

  const blob = new Blob([content], { type: mimeType })
  const formData = new FormData()
  formData.append('file', blob, filename)

  // Use native fetch since $fetch doesn't handle FormData with headers well
  const res = await fetch(url(`/api/cards/${cardId}/attachments`), {
    method: 'POST',
    body: formData,
    headers: user.headers
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Upload failed: ${res.status} ${body.message || res.statusText}`)
  }

  return await res.json() as {
    id: string
    cardId: number
    projectId: string
    storageKey: string
    originalName: string
    mimeType: string
    size: number
    uploadedById: string | null
    createdAt: string
  }
}
