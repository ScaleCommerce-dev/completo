/**
 * Which editor an AI skill is offered in.
 *
 * Single source of truth: this list was previously repeated in the public skills
 * endpoint and both admin write endpoints, which is how it came to be missing a
 * value in some of them. The DB column is plain text with no CHECK constraint, so
 * the drizzle enum in schema.ts is type-level only and adding a scope needs no
 * migration — but every validator has to know about it.
 */
export const AI_SKILL_SCOPES = ['card', 'board', 'comment'] as const

export type AiSkillScope = typeof AI_SKILL_SCOPES[number]

export function isAiSkillScope(value: unknown): value is AiSkillScope {
  return typeof value === 'string' && (AI_SKILL_SCOPES as readonly string[]).includes(value)
}
