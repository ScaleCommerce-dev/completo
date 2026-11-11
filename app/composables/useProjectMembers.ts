import type { Member } from '~/types/card'

export interface ProjectMember extends Member {
  role: 'owner' | 'member'
  /** Agents only: how many cards it holds here, which removing it unassigns. */
  assignedCardCount?: number | null
  /** Sent to owners and admins only: removing an admin keeps their agents here. */
  isAdmin?: boolean
}

/**
 * A project's members, under one key: the header's avatar stack and the list in
 * the Members dialog read the same ref, so adding someone in the dialog shows in
 * the stack without a second request.
 */
export function useProjectMembers(projectId: string) {
  return useFetch<ProjectMember[]>(`/api/projects/${projectId}/members`, {
    key: `project-members-${projectId}`
  })
}
