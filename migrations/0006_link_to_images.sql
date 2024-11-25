ALTER TABLE `organisation` ADD `imageId` text REFERENCES image(id);--> statement-breakpoint
ALTER TABLE `organisation` DROP COLUMN `image`;--> statement-breakpoint
ALTER TABLE `project` ADD `imageId` text REFERENCES image(id);--> statement-breakpoint
ALTER TABLE `project` DROP COLUMN `image`;