CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`token_endpoint_auth_method` text DEFAULT 'none' NOT NULL,
	`client_secret_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`resource` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`refresh_expires_at` integer NOT NULL,
	`resource` text,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_access_token_hash_unique` ON `oauth_grants` (`access_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_refresh_token_hash_unique` ON `oauth_grants` (`refresh_token_hash`);