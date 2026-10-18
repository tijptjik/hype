-- Refs #189, #194. Preserve display case and enforce case-insensitive uniqueness.
ALTER TABLE `user` ADD `displayUsername` text;
--> statement-breakpoint
UPDATE `user` SET `displayUsername` = `username` WHERE `username` IS NOT NULL;
--> statement-breakpoint
-- Fail on existing case collisions instead of silently merging account identities.
CREATE UNIQUE INDEX `user_username_nocase_uidx` ON `user` (lower(`username`));
--> statement-breakpoint
UPDATE `user` SET `username` = lower(`username`) WHERE `username` IS NOT NULL;
