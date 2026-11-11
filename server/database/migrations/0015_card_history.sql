CREATE TABLE `card_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`field` text NOT NULL,
	`from_id` text,
	`from_value` text,
	`to_id` text,
	`to_value` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_events_card_id_idx` ON `card_events` (`card_id`,`id`);