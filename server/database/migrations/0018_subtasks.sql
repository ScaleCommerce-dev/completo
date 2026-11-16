ALTER TABLE `boards` ADD `show_subtasks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Drizzle drops ON DELETE from ALTER TABLE ADD ... REFERENCES, so it is added by hand: deleting a parent turns its sub-tasks into ordinary cards.
ALTER TABLE `cards` ADD `parent_id` integer REFERENCES cards(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `cards_parent_idx` ON `cards` (`parent_id`);--> statement-breakpoint
ALTER TABLE `lists` ADD `show_subtasks` integer DEFAULT 0 NOT NULL;
