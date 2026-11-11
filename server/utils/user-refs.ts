import { inArray } from 'drizzle-orm'

/**
 * How a person or an agent is named in an API response: an assignee, a card's
 * creator, a comment's author, a notification's actor, a member in a picker.
 *
 * `kind` is what lets a client draw an agent as one (a square avatar, the
 * "Agent" chip) and `color` is the tint its creator picked. `managedBy` names
 * the human responsible for an agent, and is null for people. There is no
 * email here on purpose: user-facing lookups expose names only, and an agent's
 * address is synthetic.
 */
export interface UserRef {
  id: string
  name: string
  avatarUrl: string | null
  kind: 'human' | 'agent'
  color: string | null
  managedBy: { id: string, name: string, avatarUrl: string | null } | null
}

/**
 * A project member as a picker needs it: a `UserRef`, plus what tells agents
 * apart in a list. All three extras are agents-only and null or false for people:
 * a person's activity is not something other members are shown.
 */
export interface MemberRef extends UserRef {
  description: string | null
  suspended: boolean
  lastSeenAt: Date | null
}

interface UserRefSource {
  id: string
  name: string
  avatarUrl: string | null
  kind: 'human' | 'agent'
  color: string | null
  managedById: string | null
}

interface MemberRefSource extends UserRefSource {
  description: string | null
  suspendedAt: Date | null
  lastSeenAt: Date | null
}

/** The columns a `UserRef` is built from, for a `db.select({...})`. */
export function userRefColumns() {
  return {
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    kind: schema.users.kind,
    color: schema.users.color,
    managedById: schema.users.managedById
  }
}

/** The columns a `MemberRef` is built from. */
export function memberRefColumns() {
  return {
    ...userRefColumns(),
    description: schema.users.description,
    suspendedAt: schema.users.suspendedAt,
    lastSeenAt: schema.users.lastSeenAt
  }
}

/**
 * Build refs for a batch of user rows with one query for the managers of any
 * agents among them, and none when there are no agents. Pass every row the
 * response will name, then map each through `ref` or `member`.
 */
export function createUserRefs(sources: Array<UserRefSource | null | undefined>) {
  const managerIds = new Set<string>()
  for (const s of sources) {
    if (s?.kind === 'agent' && s.managedById) managerIds.add(s.managedById)
  }
  const managers = managerIds.size
    ? new Map(db.select({ id: schema.users.id, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
        .from(schema.users)
        .where(inArray(schema.users.id, [...managerIds]))
        .all()
        .map(m => [m.id, m]))
    : new Map<string, { id: string, name: string, avatarUrl: string | null }>()

  function ref(u: UserRefSource): UserRef
  function ref(u: UserRefSource | null | undefined): UserRef | null
  function ref(u: UserRefSource | null | undefined): UserRef | null {
    if (!u) return null
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      kind: u.kind,
      color: u.color,
      managedBy: u.kind === 'agent' && u.managedById ? managers.get(u.managedById) ?? null : null
    }
  }

  function member(u: MemberRefSource): MemberRef {
    const isAgent = u.kind === 'agent'
    return {
      ...ref(u),
      description: isAgent ? u.description : null,
      suspended: isAgent && !!u.suspendedAt,
      lastSeenAt: isAgent ? u.lastSeenAt : null
    }
  }

  return { ref, member }
}

interface AuthorColumns {
  authorId: string | null
  authorName: string | null
  authorAvatarUrl: string | null
  authorKind: 'human' | 'agent' | null
  authorColor: string | null
  authorManagedById: string | null
}

/**
 * Comments carry their author flat (`authorName`, `authorAvatarUrl`), so the
 * agent fields sit beside them: `authorKind`, `authorColor`, `authorManagedBy`.
 */
export function withAuthorRefs<T extends AuthorColumns>(rows: T[]) {
  const authors = rows.map(r => r.authorId && r.authorKind
    ? { id: r.authorId, name: r.authorName ?? '', avatarUrl: r.authorAvatarUrl, kind: r.authorKind, color: r.authorColor, managedById: r.authorManagedById }
    : null)
  const { ref } = createUserRefs(authors)
  return rows.map(({ authorManagedById: _managedById, ...row }, i) => ({
    ...row,
    authorManagedBy: ref(authors[i])?.managedBy ?? null
  }))
}

/** The same fields for a comment the caller just wrote. */
export function authorFields(user: UserRefSource) {
  const author = createUserRefs([user]).ref(user)
  return { authorKind: author.kind, authorColor: author.color, authorManagedBy: author.managedBy }
}
