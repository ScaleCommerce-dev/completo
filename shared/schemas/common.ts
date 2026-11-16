import { z } from 'zod'
import { isHexColor } from '../utils/colors'
import { isValidSlug } from '../utils/slug'

/**
 * Field shapes shared by the request schemas in this folder.
 *
 * Every schema names its own error: the server answers a failed parse with the
 * first issue's message as it stands (`readBodyAs` in `server/utils/validate.ts`),
 * so a message has to say which field it is about without a path in front of it.
 * Unknown keys are dropped, not refused, so a client that sends a field this
 * release does not know loses that field rather than the whole write.
 */

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type Priority = typeof PRIORITIES[number]

export const priority = z.enum(PRIORITIES, { error: 'Priority must be low, medium, high or urgent' })

/** A name or title: a string with something in it besides spaces, stored trimmed. */
export const requiredText = (field: string) =>
  z.string({ error: `${field} must be text` }).trim().min(1, { error: `${field} is required` })

export const hexColor = z.string({ error: 'Color must be a valid hex color (#RRGGBB)' })
  .refine(isHexColor, { error: 'Color must be a valid hex color (#RRGGBB)' })

export const slug = z.string({ error: 'Slug must be lowercase alphanumeric with hyphens' })
  .refine(isValidSlug, { error: 'Slug must be lowercase alphanumeric with hyphens' })

/** A date the server can store: anything `Date` parses, null to clear. */
export const dueDate = z.string({ error: 'Due date must be a date string or null' })
  .refine(s => !Number.isNaN(Date.parse(s)), { error: 'Due date must be a valid date' })
  .nullable()

/**
 * A card id, which is an integer (`TK-42`). The number or its digits, since a
 * query string or a form only has strings.
 */
export const cardRef = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform(Number)
], { error: 'Card id must be a positive integer' })

/** Where an item lands in an ordered column. One bound for every reorder; it was checked three times. */
const POSITION_ERROR = 'Position must be a non-negative integer (max 10000)'
export const position = z.number({ error: POSITION_ERROR })
  .int({ error: POSITION_ERROR })
  .min(0, { error: POSITION_ERROR })
  .max(10000, { error: POSITION_ERROR })

/**
 * Refuse a PUT that names nothing to change, which used to reach drizzle's
 * `set({})` and come back as a 500.
 */
export function somethingToUpdate<T extends Record<string, unknown>>(body: T): boolean {
  return Object.values(body).some(v => v !== undefined)
}
export const NOTHING_TO_UPDATE = { error: 'Nothing to update' }
