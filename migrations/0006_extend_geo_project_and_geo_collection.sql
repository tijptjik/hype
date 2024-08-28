/*
 SQLite does not support "Dropping foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `geoCollection` ADD `name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `geoCollection` ADD `nameShort` text NOT NULL;--> statement-breakpoint
ALTER TABLE `geoCollection` ADD `description` text;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `organisationId` text NOT NULL REFERENCES organisation(id);--> statement-breakpoint
ALTER TABLE `geoProject` ADD `code` text NOT NULL;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `nameShort` text NOT NULL;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `description` text;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `license` text DEFAULT 'Copyright' NOT NULL;--> statement-breakpoint
ALTER TABLE `geoProject` ADD `attribution` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `geoProject_code_unique` ON `geoProject` (`code`);--> statement-breakpoint