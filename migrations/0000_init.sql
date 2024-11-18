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
	`title` text NOT NULL,
	`titleGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`addressProperties` text,
	`layerId` text NOT NULL,
	`contributorId` text,
	`publisherId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`isIntangible` integer DEFAULT false NOT NULL,
	`isVisitable` integer DEFAULT true NOT NULL,
	`visitableAsOf` text DEFAULT (CURRENT_DATE),
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`publishedAt` text,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
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
CREATE TABLE `layer` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`metadata` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `layerI18n` (
	`layerId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`layerId`, `lang`),
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `layerProperty` (
	`layerId` text NOT NULL,
	`propertyId` text NOT NULL,
	`isVisible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organisation` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`url` text,
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=triangles&gap=88',
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organisationI18n` (
	`organisationId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
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
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`license` text DEFAULT 'Copyright' NOT NULL,
	`licenseGen` integer DEFAULT false NOT NULL,
	`attribution` text NOT NULL,
	`attributionGen` integer DEFAULT false NOT NULL,
	`image` text DEFAULT 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=cellular-automata&cells=9',
	`isPublished` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projectI18n` (
	`projectId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	`license` text,
	`licenseGen` integer DEFAULT true NOT NULL,
	`attribution` text,
	`attributionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`projectId`, `lang`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projectRole` (
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'maintainer' NOT NULL,
	PRIMARY KEY(`projectId`, `userId`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `property` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`type` text DEFAULT 'classifier' NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`labelGen` integer DEFAULT true NOT NULL,
	`placeholder` text DEFAULT 'Type here',
	`placeholderGen` integer DEFAULT true NOT NULL,
	`component` text DEFAULT 'SelectField' NOT NULL,
	`min` integer,
	`max` integer,
	`isTranslatable` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyI18n` (
	`propertyId` text NOT NULL,
	`lang` text NOT NULL,
	`label` text NOT NULL,
	`labelGen` integer DEFAULT true NOT NULL,
	`placeholder` text DEFAULT 'Type here',
	`placeholderGen` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyValue` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`value` text NOT NULL,
	`valueGen` integer DEFAULT true NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyValueI18n` (
	`propertyValueId` text NOT NULL,
	`lang` text NOT NULL,
	`value` text NOT NULL,
	`valueGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`propertyValueId`, `lang`),
	FOREIGN KEY (`propertyValueId`) REFERENCES `propertyValue`(`id`) ON UPDATE cascade ON DELETE cascade
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