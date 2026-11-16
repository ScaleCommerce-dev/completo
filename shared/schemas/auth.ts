import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '../utils/auth-messages'

/**
 * Sign-in, registration, password and API-token bodies.
 *
 * The messages are the ones these endpoints answered before they had schemas: a
 * missing field and a field of the wrong type both get the "required" sentence,
 * so a malformed body cannot tell a caller anything a missing one would not.
 * Emails are left as typed: each handler normalises (trims, lowercases) before
 * it compares, and the per-account login limit keys on the same normalisation.
 * Passwords are never trimmed.
 */

/** Present and a non-empty string, with one message for both failures. */
const present = (message: string) => z.string({ error: message }).min(1, { error: message })

/** The password policy: `PASSWORD_MIN_LENGTH` characters. */
const newPassword = (required: string, tooShort: string) =>
  present(required).min(PASSWORD_MIN_LENGTH, { error: tooShort })

export const loginSchema = z.object({
  email: present('Email and password are required'),
  password: present('Email and password are required')
})

export const registerSchema = z.object({
  name: present('Name, email, and password are required'),
  email: present('Name, email, and password are required'),
  password: newPassword('Name, email, and password are required', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  invitation: z.string({ error: 'invitation must be a token' }).optional()
})

export const forgotPasswordSchema = z.object({
  email: present('Email is required')
})

/**
 * The email is optional: the expired-link flow names the account through an
 * httpOnly cookie instead, and may send no body at all. The handler requires one
 * of the two.
 */
export const resendVerificationSchema = z.object({
  email: z.string({ error: 'Email is required' }).optional()
}).optional()

export const resetPasswordSchema = z.object({
  token: present('Token and password are required'),
  password: newPassword('Token and password are required', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
})

export const setupAccountSchema = z.object({
  token: present('Token and password are required'),
  password: newPassword('Token and password are required', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  name: z.string({ error: 'Name must be text' }).nullish()
})

export const passwordChangeSchema = z.object({
  currentPassword: present('Current password and new password are required'),
  newPassword: newPassword('Current password and new password are required', `New password must be at least ${PASSWORD_MIN_LENGTH} characters`)
})

export const accountDeleteSchema = z.object({
  password: present('Password is required')
})

/** `POST /api/user/tokens` and `POST /api/agents/:id/tokens`. */
export const tokenCreateSchema = z.object({
  name: z.string({ error: 'Token name is required' })
    .trim()
    .min(1, { error: 'Token name is required' })
    .max(100, { error: 'Token name must be 100 characters or less' }),
  expiresInDays: z.number({ error: 'Expiry must be a positive number of days' })
    .positive({ error: 'Expiry must be a positive number of days' })
    .nullish()
    .transform(v => v ?? undefined)
})
