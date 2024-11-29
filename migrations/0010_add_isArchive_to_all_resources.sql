ALTER TABLE `feature` ADD `isPendingReview` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `feature` ADD `isArchived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `image` ADD `isArchived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `layer` ADD `isArchived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `isArchived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `isArchived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `reviewAction` text;