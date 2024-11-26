ALTER TABLE `organisation` ADD `isPublished` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `publishedAt` text;--> statement-breakpoint
ALTER TABLE `organisation` ADD `publisherId` text REFERENCES user(id) ON DELETE SET NULL ON UPDATE CASCADE;