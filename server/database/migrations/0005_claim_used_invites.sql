-- Finish the account setup for invited users who got in without using their setup link.
--
-- Hand-written: this repairs data, so drizzle-kit generates nothing for it.
--
-- `password_hash = '!invited'` with `email_verified_at IS NULL` is exactly what user
-- management renders as "pending setup". A `last_seen_at` on such a row contradicts it —
-- somebody has authenticated as that account. Only two paths can do that without a
-- password: OAuth (`server/utils/oauth.ts`) and API-token auth
-- (`server/utils/resolve-auth.ts`, which checks neither the hash nor verification). Either
-- way the account is genuinely in use and its address has been proven, so the invitation
-- was fulfilled and the markers are simply stale.
--
-- Leaving them costs more than the misleading badge: `forgot-password` refuses to send a
-- reset link to an `!invited` or unverified account, so these users can never obtain a
-- password and stay locked to whichever provider they arrived through. Admins also keep
-- being offered "resend setup" for people already working in the app.
--
-- `'!oauth'` is the existing sentinel for "no usable password" — nothing branches on it, it
-- just stays unhashable, and it lets `reset-password` through so they can add a password.
-- `email_verified_at` is set from `last_seen_at` rather than the current time: their
-- provider verified the address when they signed in, and dating it to whenever this
-- migration happened to run would be a fabrication. First sign-in would be the honest
-- value, but the schema does not record it.
--
-- Rows still genuinely awaiting setup (`last_seen_at IS NULL`) are deliberately untouched.
UPDATE users
SET password_hash = '!oauth',
    email_verified_at = last_seen_at
WHERE password_hash = '!invited'
  AND email_verified_at IS NULL
  AND last_seen_at IS NOT NULL;
