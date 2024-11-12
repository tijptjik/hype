CREATE TABLE `featureI18n` (
	`featureId` text NOT NULL,
	`lang` text NOT NULL,
	`title` text NOT NULL,
	`titleGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`featureId`, `lang`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `featureProperty` (
	`id` text PRIMARY KEY NOT NULL,
	`featureId` text NOT NULL,
	`propertyId` text NOT NULL,
	`propertyValueId` text,
	`value` text,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyValueId`) REFERENCES `propertyValue`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `featurePropertyI18n` (
	`featurePropertyId` text NOT NULL,
	`lang` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`featurePropertyId`, `lang`),
	FOREIGN KEY (`featurePropertyId`) REFERENCES `featureProperty`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `feature` ADD `title` text NOT NULL;--> statement-breakpoint
ALTER TABLE `feature` ADD `titleGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `feature` ADD `description` text;--> statement-breakpoint
ALTER TABLE `feature` ADD `descriptionGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `feature` DROP COLUMN `properties`;