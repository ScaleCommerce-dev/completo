-- Lowercase existing addresses, then make the database enforce it.
--
-- `users.email` is UNIQUE but has no COLLATE NOCASE, and while OAuth, admin-create and
-- forgot-password all lowercased, register, login and resend-verification did not. So an
-- address could be stored with any capitalisation, and one person could end up holding two
-- rows — `foo@example.com` plus `Foo@example.com`. That second row is a working account,
-- while the first keeps whatever state it had (an unclaimed admin invite stays badged
-- "pending setup" forever), and because login and forgot-password normalise, the mixed-case
-- account can only be reached with the exact capitalisation originally typed.
--
-- The UPDATE runs against the existing case-sensitive UNIQUE(email) on purpose: if such a
-- pair exists, lowercasing the second one collides and this migration aborts instead of
-- silently merging two identities. That is a data decision, not a schema one — choose which
-- row survives (project memberships, created cards and comments all reference it by id),
-- remove or re-address the other, then re-run. Verify first with:
--
--   SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1;
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_lower_unique` ON `users` (lower("email"));
