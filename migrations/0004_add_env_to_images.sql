CREATE TABLE `featureImage` (
	`featureId` text NOT NULL,
	`imageId` text NOT NULL,
	`intent` text DEFAULT 'undefined' NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY(`featureId`, `imageId`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_intent` ON `featureImage` (`featureId`) WHERE intent = 'canonical';--> statement-breakpoint
CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`publicId` text NOT NULL,
	`cdn` text DEFAULT 'cloudinary' NOT NULL,
	`env` text DEFAULT 'dg6vtsga1' NOT NULL,
	`contributorId` text,
	`capturedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`featureId` text NOT NULL,
	`imageId` text,
	`contributorId` text NOT NULL,
	`reviewerId` text,
	`type` text NOT NULL,
	`isReviewed` integer DEFAULT false NOT NULL,
	`reviewOutcome` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `userFeature` (
	`userId` text NOT NULL,
	`featureId` text NOT NULL,
	`isVisited` integer DEFAULT false NOT NULL,
	`isWishlisted` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`userId`, `featureId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
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
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=triangles&gap=79',
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
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=cellular-automata&cells=57',
	`isPublished` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_project`("id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "image", "isPublished", "createdAt", "modifiedAt") SELECT "id", "organisationId", "code", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen", "image", "isPublished", "createdAt", "modifiedAt" FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);