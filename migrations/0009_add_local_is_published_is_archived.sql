ALTER TABLE `feature` ADD `localIsPublished` integer;--> statement-breakpoint
ALTER TABLE `feature` ADD `localIsArchived` integer;--> statement-breakpoint
ALTER TABLE `featureImage` ADD `localIsPublished` integer;--> statement-breakpoint
ALTER TABLE `image` ADD `localIsArchived` integer;--> statement-breakpoint
ALTER TABLE `project` ADD `localIsPublished` integer;--> statement-breakpoint
ALTER TABLE `project` ADD `localIsArchived` integer;--> statement-breakpoint
ALTER TABLE `layer` ADD `localIsPublished` integer;--> statement-breakpoint
ALTER TABLE `layer` ADD `localIsArchived` integer;