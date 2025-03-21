ALTER TABLE `layer` ADD `publishedAt` text;--> statement-breakpoint
ALTER TABLE `layer` ADD `publisherId` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `project` ADD `publishedAt` text;--> statement-breakpoint
ALTER TABLE `project` ADD `publisherId` text REFERENCES user(id);