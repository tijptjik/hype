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
	`imageId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_organisation`("id", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "url", "imageId", "createdAt", "modifiedAt") SELECT "id", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "url", "imageId", "createdAt", "modifiedAt" FROM `organisation`;--> statement-breakpoint
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
	`imageId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_project`("id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "imageId", "isPublished", "createdAt", "modifiedAt") SELECT "id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "imageId", "isPublished", "createdAt", "modifiedAt" FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);