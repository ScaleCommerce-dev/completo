import { $fetch } from '../../setup/server'
import type { TestUser } from '../../setup/auth'

export interface Status { id: string, name: string, category: string, position: number }

export async function statuses(u: TestUser, projectId: string): Promise<Status[]> {
  const p = await $fetch(`/api/projects/${projectId}`, { headers: u.headers }) as { statuses: Status[] }
  return p.statuses
}

export async function statusId(u: TestUser, projectId: string, name: string): Promise<string> {
  const s = (await statuses(u, projectId)).find(s => s.name === name)
  if (!s) throw new Error(`No status "${name}"`)
  return s.id
}

/** A status the default workflow lacks, such as "Canceled"; its category follows the name. */
export async function addStatus(u: TestUser, projectId: string, name: string): Promise<string> {
  const s = await $fetch(`/api/projects/${projectId}/statuses`, { method: 'POST', headers: u.headers, body: { name } }) as { id: string }
  return s.id
}

export async function addMember(owner: TestUser, projectId: string, member: TestUser) {
  await $fetch(`/api/projects/${projectId}/members`, { method: 'POST', body: { userId: member.id }, headers: owner.headers })
}
