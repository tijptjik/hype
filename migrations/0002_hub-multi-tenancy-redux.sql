ALTER TABLE `organisation` DROP COLUMN `isCoreIncluded`;--> statement-breakpoint
ALTER TABLE `organisation` ADD `isCoreInclusive` integer DEFAULT true NOT NULL;