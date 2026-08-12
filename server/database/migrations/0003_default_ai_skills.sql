-- All default AI skills: the two comment skills, and the two card skills that used
-- to be created by scripts/db-seed.ts.
--
-- Defaults belong in a migration, not the seed, because a migration runs exactly
-- once per install while the seed runs on *every* boot (dev container boot and the
-- prod entrypoint both call it). An idempotent seed insert therefore resurrects a
-- default that an admin deliberately deleted, on the next restart. A migration hands
-- the row over once and then leaves it alone: a starting point the admin owns.
-- It also means the seed can go back to doing only what its header claims — demo
-- content.
--
-- The card skills are guarded with NOT EXISTS because existing installations already
-- have them from the seed, and this must not duplicate them. Matching is on
-- name + scope, which is what the old seed guard used.
--
-- Ids are fixed rather than random so the rows stay identifiable later. Timestamps
-- use strftime('%s') because drizzle's `mode: 'timestamp'` stores Unix seconds.
--
-- The comment prompts must insist that mention syntax survives verbatim: a rewritten
-- `@[Name](ref)` no longer resolves, so the notification is silently lost and the
-- mention renders as plain text.
INSERT INTO `ai_skills` (`id`, `name`, `prompt`, `scope`, `position`, `created_at`, `updated_at`)
VALUES (
  '0f7b1a54-2c8e-4b1d-9a3f-6d5e8c7b4a21',
  'Fix Spelling & Grammar',
  'Correct only spelling, grammar and punctuation in the comment below, in the same language it was written in.

Do not rephrase, restructure, reorder or shorten anything. Do not change the meaning, tone or level of formality. Do not remove greetings or sign-offs. If nothing is wrong, return the comment unchanged.

Preserve exactly, character for character, and never delete:
- mention syntax such as @[Display Name](ref) — including one inside an opening greeting
- markdown links, including card links such as [Title (TK-42)](/projects/...)
- code blocks and inline code, including any typos inside them

Comment:
{comment}',
  'comment',
  2,
  strftime('%s', 'now'),
  strftime('%s', 'now')
);
--> statement-breakpoint
INSERT INTO `ai_skills` (`id`, `name`, `prompt`, `scope`, `position`, `created_at`, `updated_at`)
VALUES (
  '3c9d2e61-7f4a-4e58-8b26-1a9c5d3f8e72',
  'Improve Clarity',
  'Rewrite the comment below so it is clearer and easier to follow, in the same language it was written in.

Keep the author''s voice, intent and level of formality — this is one person speaking, not documentation. Keep it roughly the same length. Do not add greetings, sign-offs or filler that the author did not write, and do not remove what they did write.

Make vague references concrete where the card or the previous comments make the referent clear. If the author writes "the thing with the name" and the card is about displaying the creator''s name, say that. This is the main reason you are given the card and the thread. Where a reference is genuinely ambiguous, leave it as the author wrote it rather than guessing — and never introduce facts, decisions, dates or names that the context does not support.

Preserve exactly, character for character, and never delete:
- mention syntax such as @[Display Name](ref) — including one inside an opening greeting
- markdown links, including card links such as [Title (TK-42)](/projects/...)
- code blocks and inline code

Card:
{card}

Previous comments:
{comments}

Comment to improve:
{comment}',
  'comment',
  3,
  strftime('%s', 'now'),
  strftime('%s', 'now')
);
--> statement-breakpoint
-- Card skills, previously created by scripts/db-seed.ts. NOT EXISTS keeps existing
-- installations (which already seeded these) from ending up with duplicates.
INSERT INTO `ai_skills` (`id`, `name`, `prompt`, `scope`, `position`, `created_at`, `updated_at`)
SELECT
  'b41f8d72-5a63-4c19-9e02-7d8f3b6c1a94',
  'Generate Description',
  'Generate a description for this card:

Title: {title}
Priority: {priority}
Tags: {tags}',
  'card',
  0,
  strftime('%s', 'now'),
  strftime('%s', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM `ai_skills` WHERE `name` = 'Generate Description' AND `scope` = 'card'
);
--> statement-breakpoint
INSERT INTO `ai_skills` (`id`, `name`, `prompt`, `scope`, `position`, `created_at`, `updated_at`)
SELECT
  'c58a2e94-6b71-4d38-8f15-2c9e7a4d3b86',
  'Improve Description',
  'Improve this card description. Make it clearer, better structured, and more actionable:

Title: {title}
Priority: {priority}
Tags: {tags}

Current description:
{description}',
  'card',
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM `ai_skills` WHERE `name` = 'Improve Description' AND `scope` = 'card'
);
