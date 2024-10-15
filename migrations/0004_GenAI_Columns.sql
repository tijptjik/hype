/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `layer` ADD `nameGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `layer` ADD `nameShortGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `layer` ADD `descriptionGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `layerI18n` ADD `nameGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `layerI18n` ADD `nameShortGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `layerI18n` ADD `descriptionGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `nameGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `nameShortGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `descriptionGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organisationI18n` ADD `nameGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organisationI18n` ADD `nameShortGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organisationI18n` ADD `descriptionGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `nameGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `nameShortGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `descriptionGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `licenseGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project` ADD `attributionGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projectI18n` ADD `nameGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projectI18n` ADD `nameShortGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projectI18n` ADD `descriptionGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projectI18n` ADD `licenseGen` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projectI18n` ADD `attributionGen` integer DEFAULT true NOT NULL;