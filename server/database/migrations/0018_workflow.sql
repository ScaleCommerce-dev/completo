CREATE TABLE `card_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`from_card_id` integer NOT NULL,
	`to_card_id` integer NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_relations_unique` ON `card_relations` (`type`,`from_card_id`,`to_card_id`);--> statement-breakpoint
CREATE INDEX `card_relations_to_idx` ON `card_relations` (`to_card_id`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target_date` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_activity_project_idx` ON `project_activity` (`project_id`);--> statement-breakpoint
ALTER TABLE `cards` ADD `parent_id` integer REFERENCES cards(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `cards` ADD `milestone_id` text REFERENCES milestones(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `cards` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `cards_parent_idx` ON `cards` (`parent_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `lead_id` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `projects` ADD `state` text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `start_date_resolution` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `target_date` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `target_date_resolution` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `statuses` ADD `category` text DEFAULT 'unstarted' NOT NULL;--> statement-breakpoint
ALTER TABLE `statuses` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Drizzle drops ON DELETE from ALTER TABLE ADD ... REFERENCES; the actions above are added by hand.
-- Existing statuses get a category from their name (see categoryForStatusName), and a project's done status is completed.
UPDATE `statuses` SET `category` = CASE
	WHEN lower(trim(`name`)) = 'backlog' THEN 'backlog'
	WHEN lower(trim(`name`)) IN ('in progress', 'doing', 'review', 'in review') THEN 'started'
	WHEN lower(trim(`name`)) IN ('done', 'completed') THEN 'completed'
	WHEN lower(trim(`name`)) IN ('canceled', 'cancelled') THEN 'canceled'
	WHEN lower(trim(`name`)) = 'duplicate' THEN 'duplicate'
	ELSE 'unstarted'
END;--> statement-breakpoint
UPDATE `statuses` SET `category` = 'completed' WHERE `id` IN (SELECT `done_status_id` FROM `projects` WHERE `done_status_id` IS NOT NULL);--> statement-breakpoint
-- Statuses keep the order they were created in, which is the order a new project lists them.
UPDATE `statuses` SET `position` = (SELECT COUNT(*) FROM `statuses` AS `s` WHERE `s`.`project_id` = `statuses`.`project_id` AND `s`.`rowid` < `statuses`.`rowid`);--> statement-breakpoint
-- Projects start the manual order alphabetically, as the projects list showed them.
UPDATE `projects` SET `position` = (SELECT COUNT(*) FROM `projects` AS `p` WHERE lower(`p`.`name`) < lower(`projects`.`name`) OR (lower(`p`.`name`) = lower(`projects`.`name`) AND `p`.`rowid` < `projects`.`rowid`));
