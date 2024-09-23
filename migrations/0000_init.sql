CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feature` (
	`id` text PRIMARY KEY NOT NULL,
	`geometry` text NOT NULL,
	`properties` text NOT NULL,
	`addressProperties` text,
	`layerId` text NOT NULL,
	`contributorId` text,
	`publisherId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`isIntangible` integer DEFAULT false NOT NULL,
	`isVisitable` integer DEFAULT false NOT NULL,
	`visitableAsOf` text DEFAULT (CURRENT_DATE),
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `layer` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	`metadata` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organisation` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	`url` text,
	`image` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organisationI18n` (
	`organisationId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	PRIMARY KEY(`organisationId`, `lang`),
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organisationRole` (
	`organisationId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	PRIMARY KEY(`organisationId`, `userId`),
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	`license` text DEFAULT 'Copyright' NOT NULL,
	`attribution` text NOT NULL,
	`metadata` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`attribution` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `userActivity` (
	`userId` text PRIMARY KEY NOT NULL,
	`loginCount` integer DEFAULT 0,
	`lastLogin` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);