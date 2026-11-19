import type { BaseCard, Member, Tag } from '~/types/card'

/** A card as `GET /api/calendar` returns it. */
export type CalendarApiCard = BaseCard & {
  tags: Tag[]
  board?: { id: string, name: string, slug: string } | null
}

/** `GET /api/calendar` */
export interface CalendarResponse {
  cards: CalendarApiCard[]
  undated: CalendarApiCard[]
  projects: Array<{ id: string, name: string, slug: string, key: string, doneStatusId: string | null }>
  statuses: Array<{ id: string, projectId: string, name: string, color: string | null }>
  tags: Array<{ name: string, color: string }>
  people: Member[]
}

/** A card as the grid draws it: with what it needs from its project and status. */
export type CalendarCard = CalendarApiCard & {
  projectName: string
  projectSlug: string
  projectKey: string
  ticket: string
  statusName: string
  statusColor: string | null
  isDone: boolean
}
