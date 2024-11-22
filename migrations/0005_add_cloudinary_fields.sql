PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `image` ADD `cdnId` text;--> statement-breakpoint
ALTER TABLE `image` ADD `version` integer;--> statement-breakpoint
ALTER TABLE `image` ADD `originalFilename` text;--> statement-breakpoint
ALTER TABLE `image` ADD `originalExtension` text;--> statement-breakpoint
ALTER TABLE `image` ADD `originalWidth` integer;--> statement-breakpoint
ALTER TABLE `image` ADD `originalHeight` integer;