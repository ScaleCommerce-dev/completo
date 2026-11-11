import type { Member } from './card'
import type { LostMembership } from '~/utils/people'

/** An agent as the Agents page lists it: `GET /api/agents`. */
export interface AgentSummary extends Member {
  kind: 'agent'
  description: string | null
  suspended: boolean
  suspendedAt: string | null
  lastSeenAt: string | null
  createdAt: string
  projectCount: number
  projects: Array<{ id: string, name: string, slug: string, key: string, icon: string | null, role: string }>
  tokenCount: number
}

export interface AgentToken {
  id: string
  name: string
  tokenPrefix: string
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  isExpired: boolean
}

/** One agent on its own page: `GET /api/agents/:id`. */
export interface AgentDetail extends AgentSummary {
  /** Synthetic and never mailed; shown only here, for the CLI's COMPLETO_USER. */
  email: string
  tokens: AgentToken[]
  assignedCardCount: number
}

/** Someone agents can be handed to: `GET /api/agents/managers`. */
export interface ManagerCandidate {
  id: string
  name: string
  avatarUrl: string | null
  isAdmin: boolean
  canCreateAgents: boolean
  /** The memberships the agents in question would lose by moving to this person. */
  removedFrom: LostMembership[]
}

/** The change to a person that has to wait for their agents to be handed over. */
export type HandOverAction = 'delete' | 'suspend' | 'demote' | 'revoke'
