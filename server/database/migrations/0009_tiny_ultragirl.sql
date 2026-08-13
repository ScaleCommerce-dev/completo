ALTER TABLE `boards` ADD `hidden_card_fields` text;--> statement-breakpoint
--> The two boolean columns this replaces carried the same information for two of
--> the eight fields, so they are folded in rather than dropped. Written by hand:
--> drizzle-kit generates DDL only, and `0010` removes the columns this reads.
--> Keys are alphabetical to match `normalizeHiddenCardFields`, so a board saved
--> before and after the migration stores the same string.
UPDATE `boards` SET `hidden_card_fields` = CASE
  WHEN `show_description` = 0 AND `show_tags` = 0 THEN '["description","tags"]'
  WHEN `show_description` = 0 THEN '["description"]'
  ELSE '["tags"]'
END
WHERE `show_description` = 0 OR `show_tags` = 0;
