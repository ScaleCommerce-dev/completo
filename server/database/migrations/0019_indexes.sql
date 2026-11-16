-- Duplicates first, or the unique indexes below fail on an install that has any:
-- every add path was check-then-insert, which two concurrent requests both pass.
-- A doubled membership keeps its owner row, the others keep their oldest.
DELETE FROM `project_members` WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid, ROW_NUMBER() OVER (PARTITION BY `project_id`, `user_id` ORDER BY `role` = 'owner' DESC, rowid) AS rn
    FROM `project_members`
  ) WHERE rn = 1
);--> statement-breakpoint
DELETE FROM `card_tags` WHERE rowid NOT IN (SELECT MIN(rowid) FROM `card_tags` GROUP BY `card_id`, `tag_id`);--> statement-breakpoint
DELETE FROM `board_columns` WHERE rowid NOT IN (SELECT MIN(rowid) FROM `board_columns` GROUP BY `board_id`, `status_id`);--> statement-breakpoint
CREATE INDEX `attachments_card_idx` ON `attachments` (`card_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_columns_board_status_unique` ON `board_columns` (`board_id`,`status_id`);--> statement-breakpoint
CREATE INDEX `board_columns_status_idx` ON `board_columns` (`status_id`);--> statement-breakpoint
CREATE INDEX `boards_project_idx` ON `boards` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_tags_card_tag_unique` ON `card_tags` (`card_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `card_tags_tag_idx` ON `card_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `cards_project_status_idx` ON `cards` (`project_id`,`status_id`);--> statement-breakpoint
CREATE INDEX `cards_status_idx` ON `cards` (`status_id`);--> statement-breakpoint
CREATE INDEX `cards_assignee_idx` ON `cards` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `comments_card_idx` ON `comments` (`card_id`);--> statement-breakpoint
CREATE INDEX `list_columns_list_idx` ON `list_columns` (`list_id`);--> statement-breakpoint
CREATE INDEX `lists_project_idx` ON `lists` (`project_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_user_unique` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `statuses_project_idx` ON `statuses` (`project_id`);--> statement-breakpoint
CREATE INDEX `tags_project_idx` ON `tags` (`project_id`);