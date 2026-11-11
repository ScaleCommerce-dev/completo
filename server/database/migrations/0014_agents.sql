ALTER TABLE `users` ADD `kind` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `managed_by_id` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `users` ADD `can_create_agents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `description` text;--> statement-breakpoint
ALTER TABLE `users` ADD `color` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_agent_name_lower_unique` ON `users` (lower("name")) WHERE "users"."kind" = 'agent';
