-- Give every email token an explicit purpose, so one flow's token can't be redeemed by another.
--
-- Hand-written. drizzle-kit generated `ALTER TABLE ... ADD purpose text NOT NULL`, which
-- SQLite rejects outright on a table that holds any row ("Cannot add a NOT NULL column with
-- default value NULL") — verified, and the dev database had 5 live tokens, so that version
-- would have failed on the first install with anyone mid-signup. Adding the column with a
-- DEFAULT would work, but leaves a default in the DDL that the drizzle snapshot doesn't
-- describe, and the next `drizzle-kit generate` would try to rebuild the table to remove it.
-- So: rebuild once, here, landing exactly on the shape the snapshot declares.
--
-- The purpose of each existing row is recoverable from its user, because the three writers
-- have mutually exclusive preconditions and each deletes the user's other tokens first, so a
-- user only ever holds one:
--   * setup  — sendAccountSetupLink(), only for admin-created accounts, which sit at
--              password_hash = '!invited' until claimed.
--   * reset  — forgot-password, which bails on unverified and on '!invited' accounts, so its
--              tokens exist only where email_verified_at IS NOT NULL.
--   * verify — register / resend-verification, which only issue for unverified accounts.
-- Ordering the CASE setup → reset → verify makes those conditions non-overlapping.
CREATE TABLE `__new_email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_email_verification_tokens` (`id`, `user_id`, `token`, `purpose`, `expires_at`, `created_at`)
SELECT
	t.`id`,
	t.`user_id`,
	t.`token`,
	CASE
		WHEN u.`password_hash` = '!invited' AND u.`email_verified_at` IS NULL THEN 'setup'
		WHEN u.`email_verified_at` IS NOT NULL THEN 'reset'
		ELSE 'verify'
	END,
	t.`expires_at`,
	t.`created_at`
FROM `email_verification_tokens` t
JOIN `users` u ON u.`id` = t.`user_id`;
--> statement-breakpoint
DROP TABLE `email_verification_tokens`;
--> statement-breakpoint
ALTER TABLE `__new_email_verification_tokens` RENAME TO `email_verification_tokens`;
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_tokens_token_unique` ON `email_verification_tokens` (`token`);
