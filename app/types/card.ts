export interface Tag {
  id: string
  name: string
  color: string
}

/**
 * A person or an agent, as every user reference in the API carries it.
 *
 * `kind` is what draws an agent as one (a square avatar with the bot glyph, the
 * "Agent" chip), `color` is the tint its creator picked (people have none and
 * keep `identityColor`), and `managedBy` names the human responsible for it. All
 * three are optional because a few local shapes are built by hand from a name.
 */
export interface PersonRef {
  id: string
  name: string
  avatarUrl: string | null
  kind?: 'human' | 'agent'
  color?: string | null
  managedBy?: { id: string, name: string, avatarUrl: string | null } | null
}

/**
 * A project member, as pickers get it. `description`, `suspended` and
 * `lastSeenAt` are filled for agents only: what tells agents apart in a list.
 */
export interface Member extends PersonRef {
  description?: string | null
  suspended?: boolean
  lastSeenAt?: string | null
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
  /** Who created the card. Null for cards whose creator was deleted, or created before CF-24. */
  creator?: Member | null
  tags?: Tag[]
  attachmentCount?: number
  commentCount?: number
  /** Whether this card has comment activity the current user has not read yet. */
  hasUnread?: boolean
  createdAt: string
  updatedAt: string
}

export interface CardWithStatus extends BaseCard {
  status: CardStatus | null
}

/** Lightweight card shape used in board views (no status/timestamps needed) */
export type BoardCard = Pick<BaseCard, 'id' | 'title' | 'description' | 'priority' | 'assignee' | 'tags' | 'attachmentCount' | 'commentCount' | 'dueDate' | 'hasUnread'>

/** Someone the @ picker can offer: a member as the editors pass it along. */
export interface Mentionable extends Omit<Member, 'avatarUrl'> {
  avatarUrl?: string | null
  email?: string | null
}
