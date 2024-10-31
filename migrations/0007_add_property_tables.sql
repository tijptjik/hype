CREATE TABLE `layerProperty` (
	`layerId` text NOT NULL,
	`propertyId` text NOT NULL,
	`isVisible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `property` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`type` text DEFAULT 'classifier' NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`placeholder` text DEFAULT 'Type here',
	`component` text DEFAULT 'SelectField' NOT NULL,
	`min` integer,
	`max` integer,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyI18n` (
	`propertyId` text NOT NULL,
	`lang` text NOT NULL,
	`label` text NOT NULL,
	`placeholder` text DEFAULT 'Type here',
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyValue` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyValueI18n` (
	`propertyValueId` text NOT NULL,
	`lang` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`propertyValueId`, `lang`),
	FOREIGN KEY (`propertyValueId`) REFERENCES `propertyValue`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/