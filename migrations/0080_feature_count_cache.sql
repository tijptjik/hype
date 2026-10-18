-- Persisted count bins make common totals proportional to scope bins, not feature rows.
-- The entry row owns one feature contribution, including the missing-neighbourhood bin.
CREATE TABLE `featureCountRevision` (`id` integer PRIMARY KEY CHECK (`id` = 1), `revision` integer NOT NULL DEFAULT 0);
INSERT INTO `featureCountRevision` (`id`, `revision`) VALUES (1, 0);
CREATE TABLE `featureCountUserRevision` (`userId` text PRIMARY KEY NOT NULL, `revision` integer NOT NULL DEFAULT 0) WITHOUT ROWID;

CREATE TABLE `featureCountEntry` (
  `featureId` text PRIMARY KEY NOT NULL REFERENCES `feature` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  `organisationId` text NOT NULL,
  `projectId` text NOT NULL,
  `layerId` text NOT NULL,
  `isPublished` integer NOT NULL,
  `isArchived` integer NOT NULL,
  `isDraft` integer NOT NULL,
  `isVisitable` integer NOT NULL,
  `isIntangible` integer NOT NULL,
  `neighbourhood` text NOT NULL
) WITHOUT ROWID;
CREATE TABLE `featureCountRollup` (
  `organisationId` text NOT NULL,
  `projectId` text NOT NULL,
  `layerId` text NOT NULL,
  `isPublished` integer NOT NULL,
  `isArchived` integer NOT NULL,
  `isDraft` integer NOT NULL,
  `isVisitable` integer NOT NULL,
  `isIntangible` integer NOT NULL,
  `neighbourhood` text NOT NULL,
  `totalCount` integer NOT NULL CHECK (`totalCount` > 0),
  PRIMARY KEY (`organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`)
) WITHOUT ROWID;
CREATE INDEX `feature_count_rollup_layer_idx` ON `featureCountRollup` (`layerId`, `isDraft`, `isPublished`, `isArchived`);
CREATE INDEX `feature_count_rollup_visibility_idx` ON `featureCountRollup` (`isDraft`, `isPublished`, `isArchived`, `layerId`);
CREATE TABLE `featureCountCache` (
  `key` text PRIMARY KEY NOT NULL,
  `revision` integer NOT NULL,
  `userRevision` integer NOT NULL DEFAULT 0,
  `totalCount` integer NOT NULL,
  `facets` text NOT NULL,
  `updatedAt` integer NOT NULL
) WITHOUT ROWID;
CREATE INDEX `feature_count_cache_updated_idx` ON `featureCountCache` (`updatedAt`, `key`);
-- Keep at most 512 cached query aggregates. Revision changes do not fan out into cache deletes.
CREATE TRIGGER `feature_count_cache_trim` AFTER INSERT ON `featureCountCache` BEGIN
  DELETE FROM `featureCountCache` WHERE `key` IN (
    SELECT `key` FROM `featureCountCache` ORDER BY `updatedAt` DESC, `key` DESC LIMIT -1 OFFSET 512
  );
END;

-- Delta triggers use the entry's OLD bin so feature/cascade deletion order cannot lose it.
CREATE TRIGGER `feature_count_entry_insert` AFTER INSERT ON `featureCountEntry` BEGIN
  INSERT INTO `featureCountRollup` (`organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`, `totalCount`) VALUES (NEW.`organisationId`, NEW.`projectId`, NEW.`layerId`, NEW.`isPublished`, NEW.`isArchived`, NEW.`isDraft`, NEW.`isVisitable`, NEW.`isIntangible`, NEW.`neighbourhood`, 1)
  ON CONFLICT (`organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`) DO UPDATE SET `totalCount` = `totalCount` + 1;
END;
CREATE TRIGGER `feature_count_entry_delete` AFTER DELETE ON `featureCountEntry` BEGIN
  DELETE FROM `featureCountRollup` WHERE `organisationId` = OLD.`organisationId` AND `projectId` = OLD.`projectId` AND `layerId` = OLD.`layerId` AND `isPublished` = OLD.`isPublished` AND `isArchived` = OLD.`isArchived` AND `isDraft` = OLD.`isDraft` AND `isVisitable` = OLD.`isVisitable` AND `isIntangible` = OLD.`isIntangible` AND `neighbourhood` = OLD.`neighbourhood` AND `totalCount` = 1;
  UPDATE `featureCountRollup` SET `totalCount` = `totalCount` - 1 WHERE `organisationId` = OLD.`organisationId` AND `projectId` = OLD.`projectId` AND `layerId` = OLD.`layerId` AND `isPublished` = OLD.`isPublished` AND `isArchived` = OLD.`isArchived` AND `isDraft` = OLD.`isDraft` AND `isVisitable` = OLD.`isVisitable` AND `isIntangible` = OLD.`isIntangible` AND `neighbourhood` = OLD.`neighbourhood` AND `totalCount` > 1;
END;
CREATE TRIGGER `feature_count_entry_update` AFTER UPDATE OF `organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood` ON `featureCountEntry`
WHEN OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`layerId` IS NOT NEW.`layerId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` OR OLD.`isDraft` IS NOT NEW.`isDraft` OR OLD.`isVisitable` IS NOT NEW.`isVisitable` OR OLD.`isIntangible` IS NOT NEW.`isIntangible` OR OLD.`neighbourhood` IS NOT NEW.`neighbourhood`
BEGIN
  DELETE FROM `featureCountRollup` WHERE `organisationId` = OLD.`organisationId` AND `projectId` = OLD.`projectId` AND `layerId` = OLD.`layerId` AND `isPublished` = OLD.`isPublished` AND `isArchived` = OLD.`isArchived` AND `isDraft` = OLD.`isDraft` AND `isVisitable` = OLD.`isVisitable` AND `isIntangible` = OLD.`isIntangible` AND `neighbourhood` = OLD.`neighbourhood` AND `totalCount` = 1;
  UPDATE `featureCountRollup` SET `totalCount` = `totalCount` - 1 WHERE `organisationId` = OLD.`organisationId` AND `projectId` = OLD.`projectId` AND `layerId` = OLD.`layerId` AND `isPublished` = OLD.`isPublished` AND `isArchived` = OLD.`isArchived` AND `isDraft` = OLD.`isDraft` AND `isVisitable` = OLD.`isVisitable` AND `isIntangible` = OLD.`isIntangible` AND `neighbourhood` = OLD.`neighbourhood` AND `totalCount` > 1;
  INSERT INTO `featureCountRollup` (`organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`, `totalCount`) VALUES (NEW.`organisationId`, NEW.`projectId`, NEW.`layerId`, NEW.`isPublished`, NEW.`isArchived`, NEW.`isDraft`, NEW.`isVisitable`, NEW.`isIntangible`, NEW.`neighbourhood`, 1)
  ON CONFLICT (`organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`) DO UPDATE SET `totalCount` = `totalCount` + 1;
END;

CREATE TRIGGER `feature_count_feature_insert` AFTER INSERT ON `feature` BEGIN
  INSERT INTO `featureCountEntry` (`featureId`, `organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`) VALUES (NEW.id, NEW.`organisationId`, NEW.`projectId`, NEW.`layerId`, NEW.`isPublished`, NEW.`isArchived`, NEW.`isDraft`, NEW.`isVisitable`, NEW.`isIntangible`, coalesce((SELECT json_extract(`addressProperties`, '$.neighbourhood') FROM `featureI18n` WHERE `featureId` = NEW.id AND `locale` = 'en'), ''));
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_feature_delete` AFTER DELETE ON `feature` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_feature_update` AFTER UPDATE OF `id`, `organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible` ON `feature`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`layerId` IS NOT NEW.`layerId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` OR OLD.`isDraft` IS NOT NEW.`isDraft` OR OLD.`isVisitable` IS NOT NEW.`isVisitable` OR OLD.`isIntangible` IS NOT NEW.`isIntangible`
BEGIN
  UPDATE `featureCountEntry` SET `organisationId` = NEW.`organisationId`, `projectId` = NEW.`projectId`, `layerId` = NEW.`layerId`, `isPublished` = NEW.`isPublished`, `isArchived` = NEW.`isArchived`, `isDraft` = NEW.`isDraft`, `isVisitable` = NEW.`isVisitable`, `isIntangible` = NEW.`isIntangible` WHERE `featureId` = NEW.id;
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
-- Geography affects arbitrary spatial counts but never rewrites non-spatial rollup bins.
CREATE TRIGGER `feature_count_geometry_update` AFTER UPDATE OF `geometry`, `spatialIndex` ON `feature`
WHEN OLD.`geometry` IS NOT NEW.`geometry` OR OLD.`spatialIndex` IS NOT NEW.`spatialIndex`
BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;

-- Observe canonical English translations directly, independently from derived search
-- and neighbourhood triggers or REPLACE's recursive_triggers-dependent DELETE behavior.
CREATE TRIGGER `feature_count_i18n_insert` AFTER INSERT ON `featureI18n` BEGIN
  UPDATE `featureCountEntry` SET `neighbourhood` = coalesce((SELECT json_extract(`addressProperties`, '$.neighbourhood') FROM `featureI18n` WHERE `featureId` = NEW.featureId AND `locale` = 'en'), '')
  WHERE `featureId` = NEW.featureId AND NEW.locale = 'en';
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_i18n_delete` AFTER DELETE ON `featureI18n` BEGIN
  UPDATE `featureCountEntry` SET `neighbourhood` = coalesce((SELECT json_extract(`addressProperties`, '$.neighbourhood') FROM `featureI18n` WHERE `featureId` = OLD.featureId AND `locale` = 'en'), '')
  WHERE `featureId` = OLD.featureId AND OLD.locale = 'en';
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_i18n_membership_update` AFTER UPDATE OF `featureId`, `locale`, `addressProperties` ON `featureI18n`
WHEN OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`locale` IS NOT NEW.`locale` OR OLD.`addressProperties` IS NOT NEW.`addressProperties`
BEGIN
  UPDATE `featureCountEntry` SET `neighbourhood` = coalesce((SELECT json_extract(`addressProperties`, '$.neighbourhood') FROM `featureI18n` WHERE `featureId` = OLD.featureId AND `locale` = 'en'), '')
  WHERE `featureId` = OLD.featureId AND OLD.locale = 'en';
  UPDATE `featureCountEntry` SET `neighbourhood` = coalesce((SELECT json_extract(`addressProperties`, '$.neighbourhood') FROM `featureI18n` WHERE `featureId` = NEW.featureId AND `locale` = 'en'), '')
  WHERE `featureId` = NEW.featureId AND NEW.locale = 'en';
END;
CREATE TRIGGER `feature_count_i18n_revision_update` AFTER UPDATE OF `featureId`, `locale`, `addressProperties`, `title`, `description`, `displayAddress` ON `featureI18n`
WHEN OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`locale` IS NOT NEW.`locale` OR OLD.`addressProperties` IS NOT NEW.`addressProperties` OR OLD.`title` IS NOT NEW.`title` OR OLD.`description` IS NOT NEW.`description` OR OLD.`displayAddress` IS NOT NEW.`displayAddress`
BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;

-- Canonical changes revise cached arbitrary predicates; no per-gram or per-H3-cell triggers.

CREATE TRIGGER `feature_count_revision_featureProperty_insert` AFTER INSERT ON `featureProperty` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_featureProperty_delete` AFTER DELETE ON `featureProperty` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_featureProperty_update` AFTER UPDATE OF `featureId`, `propertyId`, `propertyValueId`, `value` ON `featureProperty`
WHEN OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`propertyId` IS NOT NEW.`propertyId` OR OLD.`propertyValueId` IS NOT NEW.`propertyValueId` OR OLD.`value` IS NOT NEW.`value` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_insert` AFTER INSERT ON `layer` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_delete` AFTER DELETE ON `layer` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_update` AFTER UPDATE OF `id`, `projectId`, `organisationId`, `isPublished`, `isArchived` ON `layer`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_insert` AFTER INSERT ON `project` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_delete` AFTER DELETE ON `project` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_update` AFTER UPDATE OF `id`, `code`, `organisationId`, `isPublished`, `isArchived` ON `project`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_insert` AFTER INSERT ON `organisation` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_delete` AFTER DELETE ON `organisation` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_update` AFTER UPDATE OF `id`, `code`, `hubId`, `isHubExclusive`, `isCoreInclusive`, `isPublished`, `isArchived` ON `organisation`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`hubId` IS NOT NEW.`hubId` OR OLD.`isHubExclusive` IS NOT NEW.`isHubExclusive` OR OLD.`isCoreInclusive` IS NOT NEW.`isCoreInclusive` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_insert` AFTER INSERT ON `hub` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_delete` AFTER DELETE ON `hub` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_update` AFTER UPDATE OF `id`, `code`, `domain` ON `hub`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`domain` IS NOT NEW.`domain` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_insert` AFTER INSERT ON `hubRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_delete` AFTER DELETE ON `hubRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_update` AFTER UPDATE OF `hubId`, `userId`, `role` ON `hubRole`
WHEN OLD.`hubId` IS NOT NEW.`hubId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_insert` AFTER INSERT ON `organisationRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_delete` AFTER DELETE ON `organisationRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_update` AFTER UPDATE OF `organisationId`, `userId`, `role` ON `organisationRole`
WHEN OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_insert` AFTER INSERT ON `projectRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_delete` AFTER DELETE ON `projectRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_update` AFTER UPDATE OF `projectId`, `userId`, `role` ON `projectRole`
WHEN OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
-- Membership changes invalidate only counts for the affected target user.
-- No user FK is intentional: cascaded user deletion can still bump its final revision.
CREATE TRIGGER `feature_count_user_insert` AFTER INSERT ON `userFeature` BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (NEW.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;
CREATE TRIGGER `feature_count_user_delete` AFTER DELETE ON `userFeature` BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (OLD.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;

CREATE TRIGGER `feature_count_user_update` AFTER UPDATE OF `userId`, `featureId`, `isWishlisted`, `isVisited` ON `userFeature`
WHEN OLD.`userId` IS NOT NEW.`userId` OR OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`isWishlisted` IS NOT NEW.`isWishlisted` OR OLD.`isVisited` IS NOT NEW.`isVisited`
BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (OLD.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`)
  SELECT NEW.userId, 1 WHERE NEW.userId IS NOT OLD.userId
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;

-- Seed exactly the existing feature corpus; orphan translations stay untouched.
INSERT INTO `featureCountEntry` (`featureId`, `organisationId`, `projectId`, `layerId`, `isPublished`, `isArchived`, `isDraft`, `isVisitable`, `isIntangible`, `neighbourhood`)
SELECT f.id, f.`organisationId`, f.`projectId`, f.`layerId`, f.`isPublished`, f.`isArchived`, f.`isDraft`, f.`isVisitable`, f.`isIntangible`, coalesce(json_extract(i.addressProperties, '$.neighbourhood'), '')
FROM `feature` f LEFT JOIN `featureI18n` i ON i.featureId = f.id AND i.locale = 'en';
