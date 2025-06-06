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
	`addressMeta` text DEFAULT '{}',
	`layerId` text NOT NULL,
	`contributorId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`publisherId` text,
	`publishedAt` text,
	`isPendingReview` integer DEFAULT false NOT NULL,
	`isArchived` integer DEFAULT false NOT NULL,
	`isIntangible` integer DEFAULT false NOT NULL,
	`isVisitable` integer DEFAULT true NOT NULL,
	`visitableAsOf` text DEFAULT (CURRENT_DATE),
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `featureI18n` (
	`featureId` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`titleGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	`displayAddress` text,
	`displayAddressGen` integer DEFAULT true NOT NULL,
	`addressProperties` text,
	PRIMARY KEY(`featureId`, `locale`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `featureImage` (
	`featureId` text NOT NULL,
	`imageId` text NOT NULL,
	`intent` text DEFAULT 'undefined' NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	PRIMARY KEY(`featureId`, `imageId`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_intent` ON `featureImage` (`featureId`) WHERE intent = 'canonical';--> statement-breakpoint
CREATE TABLE `featureProperty` (
	`featureId` text NOT NULL,
	`propertyId` text NOT NULL,
	`propertyValueId` text,
	`value` text,
	PRIMARY KEY(`featureId`, `propertyId`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyValueId`) REFERENCES `propertyValue`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `featurePropertyI18n` (
	`featureId` text NOT NULL,
	`propertyId` text NOT NULL,
	`locale` text NOT NULL,
	`value` text,
	`valueGen` integer,
	PRIMARY KEY(`featureId`, `propertyId`, `locale`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`,`propertyId`) REFERENCES `featureProperty`(`featureId`,`propertyId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`contributorId` text,
	`cdn` text DEFAULT 'cloudinary' NOT NULL,
	`env` text DEFAULT 'dg6vtsga1' NOT NULL,
	`cdnId` text,
	`publicId` text NOT NULL,
	`version` integer,
	`originalFilename` text,
	`originalExtension` text,
	`originalWidth` integer,
	`originalHeight` integer,
	`metadata` text,
	`cameraModel` text,
	`capturedAt` text,
	`latitude` text,
	`longitude` text,
	`credit` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `layer` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`metadata` text,
	`isDefaultVisible` integer DEFAULT false NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `layerI18n` (
	`layerId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`layerId`, `locale`),
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
	`url` text,
	`imageId` text,
	`isPublished` integer DEFAULT true NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);--> statement-breakpoint
CREATE TABLE `organisationI18n` (
	`organisationId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`organisationId`, `locale`),
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
	`imageId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);--> statement-breakpoint
CREATE TABLE `projectI18n` (
	`projectId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	`license` text DEFAULT 'Copyright' NOT NULL,
	`licenseGen` integer DEFAULT true NOT NULL,
	`attribution` text NOT NULL,
	`attributionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`projectId`, `locale`),
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
	`isTranslatable` integer DEFAULT true NOT NULL,
	`key` text NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
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
	`locale` text NOT NULL,
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
	`rank` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `propertyValueI18n` (
	`propertyValueId` text NOT NULL,
	`locale` text NOT NULL,
	`value` text NOT NULL,
	`valueGen` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`propertyValueId`, `locale`),
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
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`projectId` text NOT NULL,
	`featureId` text NOT NULL,
	`contributorId` text NOT NULL,
	`reviewerId` text,
	`type` text NOT NULL,
	`message` text,
	`isReviewed` integer DEFAULT false NOT NULL,
	`reviewOutcome` text,
	`reviewAction` text,
	`reviewReason` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `taskImage` (
	`taskId` text NOT NULL,
	`imageId` text NOT NULL,
	PRIMARY KEY(`taskId`, `imageId`),
	FOREIGN KEY (`taskId`) REFERENCES `task`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`attribution` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`preferences` text DEFAULT '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}' NOT NULL,
	`experimental` text DEFAULT '{"contributorMode":false, "noLabelsMode":false}' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `userActivity` (
	`userId` text PRIMARY KEY NOT NULL,
	`loginCount` integer DEFAULT 0,
	`lastLogin` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `userFeature` (
	`userId` text NOT NULL,
	`featureId` text NOT NULL,
	`isVisited` integer DEFAULT false NOT NULL,
	`isWishlisted` integer DEFAULT false NOT NULL,
	`visitedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`userId`, `featureId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `userLayer` (
	`layerId` text NOT NULL,
	`userId` text NOT NULL,
	`isVisibleOnLoad` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`layerId`, `userId`),
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
