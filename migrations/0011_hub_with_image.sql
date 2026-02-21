ALTER TABLE `hub` ADD `imageId` text REFERENCES image(id);--> statement-breakpoint
ALTER TABLE `hub` ADD `isPublished` integer DEFAULT true NOT NULL;