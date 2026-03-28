export interface Tag {
  id: string
  name: string
  color: string
}

export interface Member {
  id: string
  name: string
  avatarUrl: string | null
}

export interface CardStatus {
  id: string
  name: string
  color: string | null
}

export interface BaseCard {
  id: number
  statusId: string
  projectId: string
  title: string
  description: string | null
  assigneeId: string | null
  priority: string
  dueDate: string | null
  position: number
  assignee: Member | null
  tags?: Tag[]
  attachmentCount?: number
  createdAt: string
  updatedAt: string
}

export interface CardWithStatus extends BaseCard {
  status: CardStatus | null
}

/** Lightweight card shape used in board views (no status/timestamps needed) */
export type BoardCard = Pick<BaseCard, 'id' | 'title' | 'description' | 'priority' | 'assignee' | 'tags' | 'attachmentCount' | 'dueDate'>
