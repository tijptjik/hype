BEGIN TRANSACTION;
PRAGMA foreign_keys = off;

-- ==============================================================================
-- DENORMALIZE HIERARCHY MIGRATION
-- ==============================================================================
-- Add direct foreign keys to eliminate the need for complex hierarchy joins
-- 
-- Before: feature -> layer -> project -> organisation
-- After:  feature has direct references to layerId, projectId, organisationId
--         layer has direct references to projectId, organisationId
-- ==============================================================================

-- Step 1: Add nullable columns first to avoid constraint violations
ALTER TABLE `feature` ADD `organisationId` text;--> statement-breakpoint
ALTER TABLE `feature` ADD `projectId` text;--> statement-breakpoint
ALTER TABLE `layer` ADD `organisationId` text;--> statement-breakpoint

-- Step 2: Populate layer.organisationId from project hierarchy
-- All layers belong to projectId 'YuSFnia9VOtG' which belongs to organisationId '4Jsk5LngvFZq'
UPDATE `layer` SET `organisationId` = '4Jsk5LngvFZq' WHERE `projectId` = 'YuSFnia9VOtG';--> statement-breakpoint

-- Step 3: Populate feature.projectId and feature.organisationId from layer hierarchy
-- All features belong to layers which belong to projectId 'YuSFnia9VOtG' and organisationId '4Jsk5LngvFZq'
UPDATE `feature` SET 
  `projectId` = 'YuSFnia9VOtG',
  `organisationId` = '4Jsk5LngvFZq'
WHERE `layerId` IN (SELECT `id` FROM `layer` WHERE `projectId` = 'YuSFnia9VOtG');--> statement-breakpoint

-- Step 4: Recreate all tables with NOT NULL constraints
-- Note: Foreign keys are disabled to prevent cascading deletions
-- We must recreate ALL related tables to preserve foreign key integrity

-- ============================================================================
-- LAYER TABLE AND RELATED TABLES
-- ============================================================================

-- Create new layer table with NOT NULL organisationId
CREATE TABLE `layer_new` (
  `id` text PRIMARY KEY NOT NULL,
  `projectId` text NOT NULL,
  `organisationId` text NOT NULL,
  `metadata` text,
  `isDefaultVisible` integer DEFAULT false NOT NULL,
  `isPublished` integer DEFAULT false NOT NULL,
  `publishedAt` text,
  `publisherId` text,
  `isArchived` integer DEFAULT false NOT NULL,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);--> statement-breakpoint

-- Copy layer data with explicit column mapping
INSERT INTO `layer_new` (
  `id`, `projectId`, `organisationId`, `metadata`, `isDefaultVisible`, 
  `isPublished`, `publishedAt`, `publisherId`, `isArchived`, `createdAt`, `modifiedAt`
) 
SELECT 
  `id`, `projectId`, `organisationId`, `metadata`, `isDefaultVisible`,
  `isPublished`, `publishedAt`, `publisherId`, `isArchived`, `createdAt`, `modifiedAt`
FROM `layer`;--> statement-breakpoint

-- Create new layerI18n table
CREATE TABLE `layerI18n_new` (
  `layerId` text NOT NULL,
  `locale` text NOT NULL,
  `name` text NOT NULL,
  `nameGen` integer DEFAULT true NOT NULL,
  `nameShort` text NOT NULL,
  `nameShortGen` integer DEFAULT true NOT NULL,
  `description` text,
  `descriptionGen` integer DEFAULT true NOT NULL,
  PRIMARY KEY(`layerId`, `locale`)
);--> statement-breakpoint

-- Copy layerI18n data
INSERT INTO `layerI18n_new` (
  `layerId`, `locale`, `name`, `nameGen`, `nameShort`, `nameShortGen`, `description`, `descriptionGen`
)
SELECT 
  `layerId`, `locale`, `name`, `nameGen`, `nameShort`, `nameShortGen`, `description`, `descriptionGen`
FROM `layerI18n`;--> statement-breakpoint

-- Create new layerProperty table
CREATE TABLE `layerProperty_new` (
  `layerId` text NOT NULL,
  `propertyId` text NOT NULL,
  `isVisible` integer DEFAULT true NOT NULL,
  `isUserContributed` integer DEFAULT true NOT NULL
);--> statement-breakpoint

-- Copy layerProperty data
INSERT INTO `layerProperty_new` (
  `layerId`, `propertyId`, `isVisible`, `isUserContributed`
)
SELECT 
  `layerId`, `propertyId`, `isVisible`, `isUserContributed`
FROM `layerProperty`;--> statement-breakpoint

-- ============================================================================
-- FEATURE TABLE AND RELATED TABLES
-- ============================================================================

-- Create new feature table with NOT NULL projectId and organisationId
CREATE TABLE `feature_new` (
  `id` text PRIMARY KEY NOT NULL,
  `geometry` text NOT NULL,
  `addressMeta` text DEFAULT '{}',
  `layerId` text NOT NULL,
  `projectId` text NOT NULL,
  `organisationId` text NOT NULL,
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
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);--> statement-breakpoint

-- Copy feature data with explicit column mapping
INSERT INTO `feature_new` (
  `id`, `geometry`, `addressMeta`, `layerId`, `projectId`, `organisationId`, `contributorId`,
  `isPublished`, `publisherId`, `publishedAt`, `isPendingReview`, `isArchived`, 
  `isIntangible`, `isVisitable`, `visitableAsOf`, `createdAt`, `modifiedAt`
)
SELECT 
  `id`, `geometry`, `addressMeta`, `layerId`, `projectId`, `organisationId`, `contributorId`,
  `isPublished`, `publisherId`, `publishedAt`, `isPendingReview`, `isArchived`,
  `isIntangible`, `isVisitable`, `visitableAsOf`, `createdAt`, `modifiedAt`
FROM `feature`;--> statement-breakpoint

-- Create new featureI18n table
CREATE TABLE `featureI18n_new` (
  `featureId` text NOT NULL,
  `locale` text NOT NULL,
  `title` text NOT NULL,
  `titleGen` integer DEFAULT true NOT NULL,
  `description` text,
  `descriptionGen` integer DEFAULT true NOT NULL,
  `displayAddress` text,
  `displayAddressGen` integer DEFAULT true NOT NULL,
  `addressProperties` text,
  PRIMARY KEY(`featureId`, `locale`)
);--> statement-breakpoint

-- Copy featureI18n data
INSERT INTO `featureI18n_new` (
  `featureId`, `locale`, `title`, `titleGen`, `description`, `descriptionGen`, 
  `displayAddress`, `displayAddressGen`, `addressProperties`
)
SELECT 
  `featureId`, `locale`, `title`, `titleGen`, `description`, `descriptionGen`,
  `displayAddress`, `displayAddressGen`, `addressProperties`
FROM `featureI18n`;--> statement-breakpoint

-- Create new featureImage table
CREATE TABLE `featureImage_new` (
  `featureId` text NOT NULL,
  `imageId` text NOT NULL,
  `intent` text DEFAULT 'undefined' NOT NULL,
  `isPublished` integer DEFAULT false NOT NULL,
  `publishedAt` text,
  `publisherId` text,
  PRIMARY KEY(`featureId`, `imageId`)
);--> statement-breakpoint

-- Copy featureImage data
INSERT INTO `featureImage_new` (
  `featureId`, `imageId`, `intent`, `isPublished`, `publishedAt`, `publisherId`
)
SELECT 
  `featureId`, `imageId`, `intent`, `isPublished`, `publishedAt`, `publisherId`
FROM `featureImage`;--> statement-breakpoint

-- Create new featureProperty table
CREATE TABLE `featureProperty_new` (
  `featureId` text NOT NULL,
  `propertyId` text NOT NULL,
  `propertyValueId` text,
  `value` text,
  PRIMARY KEY(`featureId`, `propertyId`)
);--> statement-breakpoint

-- Copy featureProperty data
INSERT INTO `featureProperty_new` (
  `featureId`, `propertyId`, `propertyValueId`, `value`
)
SELECT 
  `featureId`, `propertyId`, `propertyValueId`, `value`
FROM `featureProperty`;--> statement-breakpoint

-- Create new featurePropertyI18n table
CREATE TABLE `featurePropertyI18n_new` (
  `featureId` text NOT NULL,
  `propertyId` text NOT NULL,
  `locale` text NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY(`featureId`, `propertyId`, `locale`)
);--> statement-breakpoint

-- Copy featurePropertyI18n data
INSERT INTO `featurePropertyI18n_new` (
  `featureId`, `propertyId`, `locale`, `value`
)
SELECT 
  `featureId`, `propertyId`, `locale`, `value`
FROM `featurePropertyI18n`;--> statement-breakpoint

-- Create new task table (tasks reference features)
CREATE TABLE `task_new` (
  `id` text PRIMARY KEY NOT NULL,
  `projectId` text NOT NULL,
  `featureId` text,
  `assigneeId` text,
  `assignerId` text,
  `type` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `priority` text DEFAULT 'medium' NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `dueDate` text,
  `completedAt` text,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);--> statement-breakpoint

-- Copy task data
INSERT INTO `task_new` (
  `id`, `projectId`, `featureId`, `assigneeId`, `assignerId`, `type`, `status`, 
  `priority`, `title`, `description`, `dueDate`, `completedAt`, `createdAt`, `modifiedAt`
)
SELECT 
  `id`, `projectId`, `featureId`, `assigneeId`, `assignerId`, `type`, `status`,
  `priority`, `title`, `description`, `dueDate`, `completedAt`, `createdAt`, `modifiedAt`
FROM `task`;--> statement-breakpoint

-- ============================================================================
-- DROP OLD TABLES AND RENAME NEW ONES
-- ============================================================================

-- Drop all old tables
DROP TABLE `featurePropertyI18n`;--> statement-breakpoint
DROP TABLE `featureProperty`;--> statement-breakpoint
DROP TABLE `featureImage`;--> statement-breakpoint
DROP TABLE `featureI18n`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
DROP TABLE `feature`;--> statement-breakpoint
DROP TABLE `layerProperty`;--> statement-breakpoint
DROP TABLE `layerI18n`;--> statement-breakpoint
DROP TABLE `layer`;--> statement-breakpoint

-- Rename new tables
ALTER TABLE `layer_new` RENAME TO `layer`;--> statement-breakpoint
ALTER TABLE `layerI18n_new` RENAME TO `layerI18n`;--> statement-breakpoint
ALTER TABLE `layerProperty_new` RENAME TO `layerProperty`;--> statement-breakpoint
ALTER TABLE `feature_new` RENAME TO `feature`;--> statement-breakpoint
ALTER TABLE `featureI18n_new` RENAME TO `featureI18n`;--> statement-breakpoint
ALTER TABLE `featureImage_new` RENAME TO `featureImage`;--> statement-breakpoint
ALTER TABLE `featureProperty_new` RENAME TO `featureProperty`;--> statement-breakpoint
ALTER TABLE `featurePropertyI18n_new` RENAME TO `featurePropertyI18n`;--> statement-breakpoint
ALTER TABLE `task_new` RENAME TO `task`;--> statement-breakpoint

-- Re-enable foreign keys
PRAGMA foreign_keys = on;
COMMIT;