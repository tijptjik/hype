-- BEGIN TRANSACTION;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ORGANISATION (depends on: image, hub, user - but these already exist)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_organisation` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text,
	`imageId` text,
	`hubId` text,
	`isHubExclusive` integer DEFAULT false NOT NULL,
	`isCoreInclusive` integer DEFAULT true NOT NULL,
	`isPublished` integer DEFAULT true NOT NULL,
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
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ORGANISATION ROLE (depends on: organisation, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_organisationRole` (
	`organisationId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	PRIMARY KEY(`organisationId`, `userId`),
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_organisationRole`("organisationId", "userId", "role") SELECT "organisationId", "userId", "role" FROM `organisationRole`;--> statement-breakpoint
DROP TABLE `organisationRole`;--> statement-breakpoint
ALTER TABLE `__new_organisationRole` RENAME TO `organisationRole`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. PROJECT (depends on: organisation, image, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_project` (
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
INSERT INTO `__new_project`("id", "organisationId", "code", "imageId", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt") SELECT "id", "organisationId", "code", "imageId", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt" FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PROJECT ROLE (depends on: project, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_projectRole` (
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'maintainer' NOT NULL,
	PRIMARY KEY(`projectId`, `userId`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projectRole`("projectId", "userId", "role") SELECT "projectId", "userId", "role" FROM `projectRole`;--> statement-breakpoint
DROP TABLE `projectRole`;--> statement-breakpoint
ALTER TABLE `__new_projectRole` RENAME TO `projectRole`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. PROPERTY (depends on: project)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_property` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`type` text DEFAULT 'classifier' NOT NULL,
	`isTranslatable` integer DEFAULT true NOT NULL,
	`key` text NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	`component` text DEFAULT 'SelectField' NOT NULL,
	`min` integer,
	`max` integer,
	`isUserContributed` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_property`("id", "projectId", "type", "isTranslatable", "key", "rank", "component", "min", "max", "isUserContributed", "createdAt", "modifiedAt") SELECT "id", "projectId", "type", "isTranslatable", "key", "rank", "component", "min", "max", "isUserContributed", "createdAt", "modifiedAt" FROM `property`;--> statement-breakpoint
DROP TABLE `property`;--> statement-breakpoint
ALTER TABLE `__new_property` RENAME TO `property`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. LAYER (depends on: organisation, project, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_layer` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`projectId` text NOT NULL,
	`metadata` text,
	`isDefaultVisible` integer DEFAULT false NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_layer`("id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt") SELECT "id", "organisationId", "projectId", "metadata", "isDefaultVisible", "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt" FROM `layer`;--> statement-breakpoint
DROP TABLE `layer`;--> statement-breakpoint
ALTER TABLE `__new_layer` RENAME TO `layer`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. LAYER PROPERTY (depends on: layer, property)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_layerProperty` (
	`layerId` text NOT NULL,
	`propertyId` text NOT NULL,
	`isVisible` integer DEFAULT true NOT NULL,
	`isUserContributed` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_layerProperty`("layerId", "propertyId", "isVisible", "isUserContributed") SELECT "layerId", "propertyId", "isVisible", "isUserContributed" FROM `layerProperty`;--> statement-breakpoint
DROP TABLE `layerProperty`;--> statement-breakpoint
ALTER TABLE `__new_layerProperty` RENAME TO `layerProperty`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. FEATURE (depends on: organisation, project, layer, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_feature` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`projectId` text NOT NULL,
	`layerId` text NOT NULL,
	`contributorId` text,
	`geometry` text NOT NULL,
	`addressMeta` text DEFAULT '{}',
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
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feature`("id", "organisationId", "projectId", "layerId", "contributorId", "geometry", "addressMeta", "isPublished", "publisherId", "publishedAt", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt") SELECT "id", "organisationId", "projectId", "layerId", "contributorId", "geometry", "addressMeta", "isPublished", "publisherId", "publishedAt", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt" FROM `feature`;--> statement-breakpoint
DROP TABLE `feature`;--> statement-breakpoint
ALTER TABLE `__new_feature` RENAME TO `feature`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. FEATURE PROPERTY (depends on: feature, property, propertyValue)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_featureProperty` (
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
INSERT INTO `__new_featureProperty`("featureId", "propertyId", "propertyValueId", "value") SELECT "featureId", "propertyId", "propertyValueId", "value" FROM `featureProperty`;--> statement-breakpoint
DROP TABLE `featureProperty`;--> statement-breakpoint
ALTER TABLE `__new_featureProperty` RENAME TO `featureProperty`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. FEATURE PROPERTY I18N (depends on: feature, property, featureProperty)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_featurePropertyI18n` (
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
INSERT INTO `__new_featurePropertyI18n`("featureId", "propertyId", "locale", "value", "valueGen") SELECT "featureId", "propertyId", "locale", "value", "valueGen" FROM `featurePropertyI18n`;--> statement-breakpoint
DROP TABLE `featurePropertyI18n`;--> statement-breakpoint
ALTER TABLE `__new_featurePropertyI18n` RENAME TO `featurePropertyI18n`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. FEATURE IMAGE (depends on: feature, image)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_featureImage` (
	`featureId` text NOT NULL,
	`imageId` text NOT NULL,
	`intent` text DEFAULT 'undefined' NOT NULL,
	`isPublished` integer DEFAULT false NOT NULL,
	`publishedAt` text,
	`publisherId` text,
	PRIMARY KEY(`featureId`, `imageId`),
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_featureImage`("featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId") SELECT "featureId", "imageId", "intent", "isPublished", "publishedAt", "publisherId" FROM `featureImage`;--> statement-breakpoint
DROP TABLE `featureImage`;--> statement-breakpoint
ALTER TABLE `__new_featureImage` RENAME TO `featureImage`;--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_intent` ON `featureImage` (`featureId`) WHERE intent = 'canonical';--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. USER FEATURE (depends on: user, feature)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_userFeature` (
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
INSERT INTO `__new_userFeature`("userId", "featureId", "isVisited", "isWishlisted", "visitedAt", "createdAt", "modifiedAt") SELECT "userId", "featureId", "isVisited", "isWishlisted", "visitedAt", "createdAt", "modifiedAt" FROM `userFeature`;--> statement-breakpoint
DROP TABLE `userFeature`;--> statement-breakpoint
ALTER TABLE `__new_userFeature` RENAME TO `userFeature`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. USER LAYER (depends on: layer, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_userLayer` (
	`layerId` text NOT NULL,
	`userId` text NOT NULL,
	`isVisibleOnLoad` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`layerId`, `userId`),
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_userLayer`("layerId", "userId", "isVisibleOnLoad") SELECT "layerId", "userId", "isVisibleOnLoad" FROM `userLayer`;--> statement-breakpoint
DROP TABLE `userLayer`;--> statement-breakpoint
ALTER TABLE `__new_userLayer` RENAME TO `userLayer`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. TASK (depends on: organisation, project, feature, user)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_task` (
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
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_task`("id", "organisationId", "projectId", "featureId", "contributorId", "reviewerId", "type", "message", "isReviewed", "reviewOutcome", "reviewAction", "reviewReason", "createdAt", "modifiedAt") SELECT "id", "organisationId", "projectId", "featureId", "contributorId", "reviewerId", "type", "message", "isReviewed", "reviewOutcome", "reviewAction", "reviewReason", "createdAt", "modifiedAt" FROM `task`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
ALTER TABLE `__new_task` RENAME TO `task`;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. TASK IMAGE (depends on: task, image)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE `__new_taskImage` (
	`taskId` text NOT NULL,
	`imageId` text NOT NULL,
	PRIMARY KEY(`taskId`, `imageId`),
	FOREIGN KEY (`taskId`) REFERENCES `task`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_taskImage`("taskId", "imageId") SELECT "taskId", "imageId" FROM `taskImage`;--> statement-breakpoint
DROP TABLE `taskImage`;--> statement-breakpoint
ALTER TABLE `__new_taskImage` RENAME TO `taskImage`;

-- COMMIT;
PRAGMA foreign_keys=ON;--> statement-breakpoint
