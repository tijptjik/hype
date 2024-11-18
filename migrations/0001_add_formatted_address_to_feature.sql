PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organisation` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`url` text,
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=triangles&gap=7',
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_organisation`("id", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "url", "image", "createdAt", "modifiedAt") SELECT "id", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "url", "image", "createdAt", "modifiedAt" FROM `organisation`;--> statement-breakpoint
DROP TABLE `organisation`;--> statement-breakpoint
ALTER TABLE `__new_organisation` RENAME TO `organisation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);--> statement-breakpoint
CREATE TABLE `__new_project` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`license` text DEFAULT 'Copyright' NOT NULL,
	`licenseGen` integer DEFAULT false NOT NULL,
	`attribution` text NOT NULL,
	`attributionGen` integer DEFAULT false NOT NULL,
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=cellular-automata&cells=92',
	`isPublished` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project`("id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "image", "isPublished", "createdAt", "modifiedAt") SELECT "id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "image", "isPublished", "createdAt", "modifiedAt" FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);--> statement-breakpoint
ALTER TABLE `feature` ADD `formattedAddress` text;--> statement-breakpoint
ALTER TABLE `feature` ADD `formattedAddressGen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `featureI18n` ADD `formattedAddress` text;--> statement-breakpoint
ALTER TABLE `featureI18n` ADD `formattedAddressGen` integer DEFAULT false NOT NULL;