PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hubRole` (
	`hubId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	PRIMARY KEY(`hubId`, `userId`),
	FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_hubRole`("hubId", "userId", "role") SELECT "hubId", "userId", "role" FROM `hubRole`;--> statement-breakpoint
DROP TABLE `hubRole`;--> statement-breakpoint
ALTER TABLE `__new_hubRole` RENAME TO `hubRole`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_organisation` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text,
	`imageId` text,
	`hubId` text,
	`isHubExclusive` integer DEFAULT false NOT NULL,
	`isCoreInclusive` integer DEFAULT true NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_organisation`("id", "code", "url", "imageId", "hubId", "isHubExclusive", "isCoreInclusive", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt") SELECT "id", "code", "url", "imageId", "hubId", "isHubExclusive", "isCoreInclusive", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt" FROM `organisation`;--> statement-breakpoint
DROP TABLE `organisation`;--> statement-breakpoint
ALTER TABLE `__new_organisation` RENAME TO `organisation`;--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);