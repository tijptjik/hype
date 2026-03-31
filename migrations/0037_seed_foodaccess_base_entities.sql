PRAGMA foreign_keys=ON;

-- Seed Farm The City and the Food Access project base entities.

BEGIN TRANSACTION;

INSERT INTO "image" (
  "id", "contributorId", "cdn", "env", "cdnId", "publicId", "version",
  "originalFilename", "originalExtension", "originalWidth", "originalHeight",
  "metadata", "cameraModel", "capturedAt", "latitude", "longitude", "credit",
  "isArchived", "createdAt", "modifiedAt"
) VALUES (
  '2xZYTI6NpVIK', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '69b50165d9dc34f7f6777d9bc46b14f2', 'farmthecity/cqxyxyiiatjwtuh9kd6r', 1757918656,
  'FTC logo_coloured', 'avif', 165, 90,
  '{}', '', '2025-09-15T06:44:16.947Z', NULL, NULL, NULL,
  0, '2025-09-15T06:44:17.179Z', '2025-09-15T06:44:17.179Z'
)
ON CONFLICT("id") DO UPDATE SET
  "contributorId" = excluded."contributorId",
  "cdn" = excluded."cdn",
  "env" = excluded."env",
  "cdnId" = excluded."cdnId",
  "publicId" = excluded."publicId",
  "version" = excluded."version",
  "originalFilename" = excluded."originalFilename",
  "originalExtension" = excluded."originalExtension",
  "originalWidth" = excluded."originalWidth",
  "originalHeight" = excluded."originalHeight",
  "metadata" = excluded."metadata",
  "cameraModel" = excluded."cameraModel",
  "capturedAt" = excluded."capturedAt",
  "latitude" = excluded."latitude",
  "longitude" = excluded."longitude",
  "credit" = excluded."credit",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "organisation" (
  "id", "code", "url", "imageId", "hubId", "isHubExclusive", "isCoreInclusive",
  "isPublished", "publishedAt", "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  'kP31z2fP4-k2', 'farmthecity', 'https://www.farmthecity.hk', '2xZYTI6NpVIK', NULL, 0, 1,
  1, NULL, NULL, 0, '2025-09-15T06:43:34.442Z', '2025-09-15T06:44:17.237Z'
)
ON CONFLICT("id") DO UPDATE SET
  "code" = excluded."code",
  "url" = excluded."url",
  "imageId" = excluded."imageId",
  "hubId" = excluded."hubId",
  "isHubExclusive" = excluded."isHubExclusive",
  "isCoreInclusive" = excluded."isCoreInclusive",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "organisationI18n" (
  "organisationId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'kP31z2fP4-k2', 'en', 'Farm The City HK', 0, 'FarmTheCity', 0, 'Farm the City brings together city stakeholders through community gardening and sustainability education programmes to be the catalyst towards greater climate and urban resilience for humanity.

Through integrating ecology, societies and the built environment into a regenerative urban ecosystem, we aim to collaboratively design our future green cities powered by a circular and equitable food system.', 0
)
ON CONFLICT("organisationId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "organisationI18n" (
  "organisationId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'kP31z2fP4-k2', 'zh-hans', '香港城市农场', 1, '农场城市', 1, 'Farm the City 通过社区园艺和可持续发展教育计划将城市利益相关者聚集在一起，成为人类改善气候和城市复原力的催化剂。

通过将生态、社会和建筑环境融入可再生的城市生态系统中，我们的目标是合作设计由循环和公平的食品系统驱动的未来绿色城市。', 1
)
ON CONFLICT("organisationId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "organisationI18n" (
  "organisationId", "locale", "name", "nameGen", "nameShort", "nameShortGen", "description", "descriptionGen"
) VALUES (
  'kP31z2fP4-k2', 'zh-hant', 'Farm The City HK', 1, 'FarmTheCity', 1, 'Farm the City透過社區園藝和可持續發展教育計劃將城市持份者聚集在一起，成為推動人類改善氣候和城市復原力的催化劑。

透過將生態、社會同建築環境融入到一個可再生嘅城市生態系統中，我哋旨在合作設計我哋未來嘅綠色城市，由循環同公平嘅食物系統驅動。', 1
)
ON CONFLICT("organisationId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen";

INSERT INTO "project" (
  "id", "organisationId", "code", "imageId", "isPublished", "publishedAt",
  "publisherId", "isArchived", "createdAt", "modifiedAt"
) VALUES (
  'LsmysOOa9RoU', 'kP31z2fP4-k2', 'foodaccess', NULL, 1, '2025-10-01T16:03:49.133Z',
  NULL, 0, '2025-09-15T06:48:02.724Z', '2025-10-01T16:03:49.520Z'
)
ON CONFLICT("id") DO UPDATE SET
  "organisationId" = excluded."organisationId",
  "code" = excluded."code",
  "imageId" = excluded."imageId",
  "isPublished" = excluded."isPublished",
  "publishedAt" = excluded."publishedAt",
  "publisherId" = excluded."publisherId",
  "isArchived" = excluded."isArchived",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectI18n" (
  "projectId", "locale", "name", "nameGen", "nameShort", "nameShortGen",
  "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen"
) VALUES (
  'LsmysOOa9RoU', 'en', 'Food Accessibility', 0, 'FoodAccess', 0,
  NULL, 1, 'Copyright - Contact for use', 0, '© Farm The City HK', 0
)
ON CONFLICT("projectId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen",
  "license" = excluded."license",
  "licenseGen" = excluded."licenseGen",
  "attribution" = excluded."attribution",
  "attributionGen" = excluded."attributionGen";

INSERT INTO "projectI18n" (
  "projectId", "locale", "name", "nameGen", "nameShort", "nameShortGen",
  "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen"
) VALUES (
  'LsmysOOa9RoU', 'zh-hans', '食物可及性', 1, '食品获取', 1,
  '', 1, '版权 - 联系使用', 1, '© 香港城市农场', 1
)
ON CONFLICT("projectId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen",
  "license" = excluded."license",
  "licenseGen" = excluded."licenseGen",
  "attribution" = excluded."attribution",
  "attributionGen" = excluded."attributionGen";

INSERT INTO "projectI18n" (
  "projectId", "locale", "name", "nameGen", "nameShort", "nameShortGen",
  "description", "descriptionGen", "license", "licenseGen", "attribution", "attributionGen"
) VALUES (
  'LsmysOOa9RoU', 'zh-hant', '食通', 1, '食通', 1,
  '', 1, '版權 - 使用聯絡方式', 1, '© Farm The City HK', 1
)
ON CONFLICT("projectId", "locale") DO UPDATE SET
  "name" = excluded."name",
  "nameGen" = excluded."nameGen",
  "nameShort" = excluded."nameShort",
  "nameShortGen" = excluded."nameShortGen",
  "description" = excluded."description",
  "descriptionGen" = excluded."descriptionGen",
  "license" = excluded."license",
  "licenseGen" = excluded."licenseGen",
  "attribution" = excluded."attribution",
  "attributionGen" = excluded."attributionGen";

COMMIT;
