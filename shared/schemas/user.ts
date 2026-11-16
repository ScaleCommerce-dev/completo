import { z } from 'zod'
import { NOTHING_TO_UPDATE, requiredText, somethingToUpdate } from './common'

/** `PUT /api/user/profile`. */
export const profileUpdateSchema = z.object({
  name: requiredText('Name').optional(),
  avatarUrl: z.string({ error: 'Invalid avatar URL' })
    .max(2048, { error: 'Invalid avatar URL' })
    .refine(u => u === '' || /^https?:\/\//i.test(u), { error: 'Avatar URL must use http or https' })
    .nullable().optional(),
  colorMode: z.enum(['light', 'dark', 'system'], { error: 'colorMode must be light, dark or system' }).nullable().optional(),
  emailNotifications: z.boolean({ error: 'emailNotifications must be a boolean' }).optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
