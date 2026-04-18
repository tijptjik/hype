PRAGMA foreign_keys=ON;

-- Seed Food Access project-scoped properties and their value catalogs.
INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'FCoxx_YIRlae', 'LsmysOOa9RoU', 'project', 'classifier', 'chain', 'SelectField', 1,
  1, 1, '2025-10-01T15:40:45.236Z', '2025-10-01T15:40:45.236Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'FCoxx_YIRlae', 1, 1, 0)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'BBYOVU49oSfx', 'LsmysOOa9RoU', 'project', 'classifier', 'ownershipDirect', 'SelectField', 1,
  1, 1, '2025-10-01T15:40:51.871Z', '2025-10-01T15:40:51.871Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'BBYOVU49oSfx', 1, 1, 1)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'uWAk1721Ma4_', 'LsmysOOa9RoU', 'project', 'classifier', 'ownershipGroup', 'SelectField', 1,
  1, 1, '2025-10-01T15:40:56.392Z', '2025-10-01T15:40:56.392Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'uWAk1721Ma4_', 1, 1, 2)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'J3E2gk$U23_J', 'LsmysOOa9RoU', 'project', 'classifier', 'ownership', 'SelectField', 1,
  1, 1, '2025-10-01T15:41:02.059Z', '2025-10-01T15:41:02.059Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'J3E2gk$U23_J', 1, 1, 3)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  '7RqvQvMw0Fk5', 'LsmysOOa9RoU', 'project', 'classifier', 'provider', 'SelectField', 1,
  1, 1, '2025-10-01T15:41:06.129Z', '2025-10-01T15:41:06.129Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', '7RqvQvMw0Fk5', 1, 1, 4)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'xLSy8o3JDA9K', 'LsmysOOa9RoU', 'project', 'classifier', 'importByAir', 'ToggleField', 0,
  1, 1, '2025-10-01T15:41:10.182Z', '2025-10-01T15:41:10.182Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'xLSy8o3JDA9K', 1, 1, 5)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  '9Zsd4E4Vi9ZP', 'LsmysOOa9RoU', 'project', 'classifier', 'importBySea', 'ToggleField', 0,
  1, 1, '2025-10-01T15:41:13.078Z', '2025-10-01T15:41:13.078Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', '9Zsd4E4Vi9ZP', 1, 1, 6)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'ZV47U3_RVxuR', 'LsmysOOa9RoU', 'project', 'classifier', 'importByLand', 'ToggleField', 0,
  1, 1, '2025-10-01T15:41:16.069Z', '2025-10-01T15:41:16.069Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'ZV47U3_RVxuR', 1, 1, 7)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  '6H3OZ41x64bB', 'LsmysOOa9RoU', 'project', 'classifier', 'localSource', 'ToggleField', 0,
  1, 1, '2025-10-01T15:41:19.255Z', '2025-10-01T15:41:19.255Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', '6H3OZ41x64bB', 1, 1, 8)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'z8FdPeJrY7e5', 'LsmysOOa9RoU', 'project', 'classifier', 'weekDayOpen', 'RangeField', 0,
  1, 1, '2025-10-01T15:41:27.463Z', '2025-10-01T15:41:27.463Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'z8FdPeJrY7e5', 1, 1, 9)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'TNKWqpSchuU7', 'LsmysOOa9RoU', 'project', 'classifier', 'weekDayClose', 'RangeField', 0,
  1, 1, '2025-10-01T15:41:30.559Z', '2025-10-01T15:41:30.559Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'TNKWqpSchuU7', 1, 1, 10)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'yjiegt5TvcPP', 'LsmysOOa9RoU', 'project', 'classifier', 'weekEndOpen', 'RangeField', 0,
  1, 1, '2025-10-01T15:41:35.817Z', '2025-10-01T15:41:35.817Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'yjiegt5TvcPP', 1, 1, 11)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

INSERT INTO "property" (
  "id", "projectId", "scope", "type", "key", "component", "isTranslatable",
  "isUserContributable", "isDefaultEnabled", "createdAt", "modifiedAt"
) VALUES (
  'Hi2Gmv7jwjQj', 'LsmysOOa9RoU', 'project', 'classifier', 'weekEndClose', 'RangeField', 0,
  1, 1, '2025-10-01T15:41:39.366Z', '2025-10-01T15:41:39.366Z'
)
ON CONFLICT("id") DO UPDATE SET
  "projectId" = excluded."projectId",
  "scope" = excluded."scope",
  "type" = excluded."type",
  "key" = excluded."key",
  "component" = excluded."component",
  "isTranslatable" = excluded."isTranslatable",
  "isUserContributable" = excluded."isUserContributable",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "createdAt" = excluded."createdAt",
  "modifiedAt" = excluded."modifiedAt";

INSERT INTO "projectProperty" ("projectId", "propertyId", "isEnabled", "isDefaultEnabled", "rank")
VALUES ('LsmysOOa9RoU', 'Hi2Gmv7jwjQj', 1, 1, 12)
ON CONFLICT("projectId", "propertyId") DO UPDATE SET
  "isEnabled" = excluded."isEnabled",
  "isDefaultEnabled" = excluded."isDefaultEnabled",
  "rank" = excluded."rank";

DELETE FROM "propertyI18n" WHERE "propertyId" IN ('FCoxx_YIRlae', 'BBYOVU49oSfx', 'uWAk1721Ma4_', 'J3E2gk$U23_J', '7RqvQvMw0Fk5', 'xLSy8o3JDA9K', '9Zsd4E4Vi9ZP', 'ZV47U3_RVxuR', '6H3OZ41x64bB', 'z8FdPeJrY7e5', 'TNKWqpSchuU7', 'yjiegt5TvcPP', 'Hi2Gmv7jwjQj');

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('6H3OZ41x64bB', 'en', 'LocalSource', 0, 'Enter LocalSource', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('6H3OZ41x64bB', 'zh-hans', '本地源', 1, '输入 LocalSource', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('6H3OZ41x64bB', 'zh-hant', 'LocalSource', 1, '進入LocalSource', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('7RqvQvMw0Fk5', 'en', 'Provider', 0, 'Enter Provider', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('7RqvQvMw0Fk5', 'zh-hans', '供应商', 1, '输入提供商', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('7RqvQvMw0Fk5', 'zh-hant', '提供者', 1, '進提供者', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('9Zsd4E4Vi9ZP', 'en', 'ImportBySea', 0, 'Enter ImportBySea', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('9Zsd4E4Vi9ZP', 'zh-hans', '海运进口', 1, '输入 ImportBySea', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('9Zsd4E4Vi9ZP', 'zh-hant', 'ImportBySea', 1, '輸入ImportBySea', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('BBYOVU49oSfx', 'en', 'OwnershipDirect', 0, 'Enter OwnershipDirect', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('BBYOVU49oSfx', 'zh-hans', '所有权直接', 1, '进入 OwnershipDirect', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('BBYOVU49oSfx', 'zh-hant', 'OwnershipDirect', 1, '進入OwnershipDirect', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('FCoxx_YIRlae', 'en', 'Chain', 0, 'Enter Chain', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('FCoxx_YIRlae', 'zh-hans', '链', 1, '进入链', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('FCoxx_YIRlae', 'zh-hant', '鎖鏈', 1, '入鏈', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('Hi2Gmv7jwjQj', 'en', 'WeekEndClose', 0, 'Enter WeekEndClose', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('Hi2Gmv7jwjQj', 'zh-hans', '周末关闭', 1, '输入 WeekEndClose', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('Hi2Gmv7jwjQj', 'zh-hant', '週末關閉', 1, '進入WeekEndClose', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('J3E2gk$U23_J', 'en', 'Ownership', 0, 'Enter Ownership', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('J3E2gk$U23_J', 'zh-hans', '所有权', 1, '输入所有权', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('J3E2gk$U23_J', 'zh-hant', '擁有權', 1, '進入所有權', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('TNKWqpSchuU7', 'en', 'WeekDayClose', 0, 'Enter WeekDayClose', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('TNKWqpSchuU7', 'zh-hans', '平日收盘', 1, '输入 WeekDayClose', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('TNKWqpSchuU7', 'zh-hant', '平日收市', 1, '進入WeekDayClose', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('ZV47U3_RVxuR', 'en', 'ImportByLand', 0, 'Enter ImportByLand', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('ZV47U3_RVxuR', 'zh-hans', 'ImportByLand （由土地进口）', 1, '输入 ImportByLand', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('ZV47U3_RVxuR', 'zh-hant', 'ImportByLand', 1, '輸入ImportByLand', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('uWAk1721Ma4_', 'en', 'OwnershipGroup', 0, 'Enter OwnershipGroup', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('uWAk1721Ma4_', 'zh-hans', '所有权组', 1, '输入所有权组', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('uWAk1721Ma4_', 'zh-hant', '擁有組', 1, '進入OwnershipGroup', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('xLSy8o3JDA9K', 'en', 'ImportByAir', 0, 'Enter ImportByAir', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('xLSy8o3JDA9K', 'zh-hans', '空运进口', 1, '输入 ImportByAir', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('xLSy8o3JDA9K', 'zh-hant', 'ImportByAir', 1, '輸入ImportByAir', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('yjiegt5TvcPP', 'en', 'WeekEndOpen', 0, 'Enter WeekEndOpen', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('yjiegt5TvcPP', 'zh-hans', '周末开放', 1, '进入 WeekEndOpen', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('yjiegt5TvcPP', 'zh-hant', 'WeekEndOpen', 1, '進入WeekEndOpen', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('z8FdPeJrY7e5', 'en', 'WeekDayOpen', 0, 'Enter WeekDayOpen', 0);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('z8FdPeJrY7e5', 'zh-hans', '平日开放', 1, '进入 WeekDayOpen', 1);

INSERT INTO "propertyI18n" ("propertyId", "locale", "label", "labelGen", "placeholder", "placeholderGen")
VALUES ('z8FdPeJrY7e5', 'zh-hant', '平日開放', 1, '進入WeekDayOpen', 1);

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('wL1sp825MAAC', '7RqvQvMw0Fk5', 0, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('Cmb_1kyaU_UD', '7RqvQvMw0Fk5', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('2k3hWtBKx7ev', '7RqvQvMw0Fk5', 2, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('L36Z3un3HKAt', '7RqvQvMw0Fk5', 3, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('4Rafcc4U9qIz', '7RqvQvMw0Fk5', 4, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('W1Lb3Zelk9Un', 'BBYOVU49oSfx', 0, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('7E0$wvnhNXW9', 'BBYOVU49oSfx', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('z9ea1F98AHXh', 'BBYOVU49oSfx', 2, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('5gTGtmDC7mg9', 'BBYOVU49oSfx', 3, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('OGzE2Uk2itBk', 'BBYOVU49oSfx', 4, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('MxF4GHWQCqdN', 'FCoxx_YIRlae', 0, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('4oh27fsP5aWM', 'FCoxx_YIRlae', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('2UEvZVz_qiwd', 'FCoxx_YIRlae', 2, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('Eah5S_JYm2PR', 'FCoxx_YIRlae', 3, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('usK2qv9i28$5', 'FCoxx_YIRlae', 4, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('46M3W9rq7Zob', 'FCoxx_YIRlae', 5, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('I3f6TnWdtj79', 'FCoxx_YIRlae', 6, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('1V15s9evu9iM', 'FCoxx_YIRlae', 7, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('x4Cs_vYhWP_2', 'FCoxx_YIRlae', 8, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('G44My80iSBlG', 'FCoxx_YIRlae', 9, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('6rYApYZ$rY2a', 'FCoxx_YIRlae', 10, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('DghYuhxO6hoM', 'FCoxx_YIRlae', 11, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('Eq3iXlCBzMO7', 'FCoxx_YIRlae', 12, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('lcOh5eHwTEUx', 'J3E2gk$U23_J', 0, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('TL6lXVWumnfL', 'J3E2gk$U23_J', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('dci5cvkCANDW', 'uWAk1721Ma4_', 0, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('6z4eZUp9Qrls', 'uWAk1721Ma4_', 1, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('7l_4fbdy487R', 'uWAk1721Ma4_', 2, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValue" ("id", "propertyId", "rank", "value")
VALUES ('h7H$Y79itPCU', 'uWAk1721Ma4_', 3, NULL)
ON CONFLICT("id") DO UPDATE SET
  "propertyId" = excluded."propertyId",
  "rank" = excluded."rank",
  "value" = excluded."value";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('1V15s9evu9iM', 'en', 'Taste', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('1V15s9evu9iM', 'zh-hans', '味道', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('1V15s9evu9iM', 'zh-hant', '品嘗', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2UEvZVz_qiwd', 'en', 'U Select', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2UEvZVz_qiwd', 'zh-hans', 'U 选择', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2UEvZVz_qiwd', 'zh-hant', 'U選', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2k3hWtBKx7ev', 'en', 'Caring Estate', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2k3hWtBKx7ev', 'zh-hans', '关爱遗产', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('2k3hWtBKx7ev', 'zh-hant', '愛心邨', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('46M3W9rq7Zob', 'en', 'Wellcome', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('46M3W9rq7Zob', 'zh-hans', '惠康', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('46M3W9rq7Zob', 'zh-hant', '惠來', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4Rafcc4U9qIz', 'en', 'Partner Volunteer Service', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4Rafcc4U9qIz', 'zh-hans', '合作伙伴志愿服务', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4Rafcc4U9qIz', 'zh-hant', '夥伴義工服務', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4oh27fsP5aWM', 'en', 'M&S Food', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4oh27fsP5aWM', 'zh-hans', '玛莎百货食品', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('4oh27fsP5aWM', 'zh-hant', 'M&S食品', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('5gTGtmDC7mg9', 'en', 'City Super Group', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('5gTGtmDC7mg9', 'zh-hans', '城市超级集团', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('5gTGtmDC7mg9', 'zh-hant', '城超集團', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6rYApYZ$rY2a', 'en', 'Fusion', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6rYApYZ$rY2a', 'zh-hans', '融合', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6rYApYZ$rY2a', 'zh-hant', '融合', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6z4eZUp9Qrls', 'en', 'China Resources Group', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6z4eZUp9Qrls', 'zh-hans', '华润集团', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('6z4eZUp9Qrls', 'zh-hant', '華潤集團', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7E0$wvnhNXW9', 'en', 'China Resources Vanguard', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7E0$wvnhNXW9', 'zh-hans', '华润万家', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7E0$wvnhNXW9', 'zh-hant', '華潤萬頭', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7l_4fbdy487R', 'en', 'Jardine Matheson Holdings', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7l_4fbdy487R', 'zh-hans', '怡和控股', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('7l_4fbdy487R', 'zh-hant', '怡和控股', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Cmb_1kyaU_UD', 'en', 'Caring Restaurant', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Cmb_1kyaU_UD', 'zh-hans', '关爱餐厅', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Cmb_1kyaU_UD', 'zh-hant', '愛心酒樓', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('DghYuhxO6hoM', 'en', 'DON DON DONKI', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('DghYuhxO6hoM', 'zh-hans', '唐·唐·东基', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('DghYuhxO6hoM', 'zh-hant', '唐唐東基', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eah5S_JYm2PR', 'en', 'Market Place', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eah5S_JYm2PR', 'zh-hans', '市场', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eah5S_JYm2PR', 'zh-hant', '市場', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eq3iXlCBzMO7', 'en', 'HKTV Mall', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eq3iXlCBzMO7', 'zh-hans', '香港电视商场', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('Eq3iXlCBzMO7', 'zh-hant', '港視商場', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('G44My80iSBlG', 'en', 'Aeon', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('G44My80iSBlG', 'zh-hans', '伊恩', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('G44My80iSBlG', 'zh-hant', '永旺', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('I3f6TnWdtj79', 'en', 'PARK n SHOP', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('I3f6TnWdtj79', 'zh-hans', '百佳商店', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('I3f6TnWdtj79', 'zh-hant', 'PARK N SHOP百貨店', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('L36Z3un3HKAt', 'en', 'Food-Co Service Point', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('L36Z3un3HKAt', 'zh-hans', 'Food-Co 服务点', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('L36Z3un3HKAt', 'zh-hant', 'Food-Co服務點', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('MxF4GHWQCqdN', 'en', 'Link Market', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('MxF4GHWQCqdN', 'zh-hans', 'Link 市场', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('MxF4GHWQCqdN', 'zh-hant', '鏈市', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('OGzE2Uk2itBk', 'en', 'AS Watson Group', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('OGzE2Uk2itBk', 'zh-hans', '屈臣氏集团', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('OGzE2Uk2itBk', 'zh-hant', '屈臣氏集團', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('TL6lXVWumnfL', 'en', 'private', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('TL6lXVWumnfL', 'zh-hans', '私人', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('TL6lXVWumnfL', 'zh-hant', '私人', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('W1Lb3Zelk9Un', 'en', 'Link Asset Management Limited (LINK)', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('W1Lb3Zelk9Un', 'zh-hans', '领展资产管理有限公司 （LINK）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('W1Lb3Zelk9Un', 'zh-hant', '領展資產管理有限公司（領展）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('dci5cvkCANDW', 'en', 'Link Real Estate Investment Trust (LINK REIT)', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('dci5cvkCANDW', 'zh-hans', '领展房地产投资信托基金 （LINK REIT）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('dci5cvkCANDW', 'zh-hant', '領展房地產投資信託基金 （LINK REIT）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('h7H$Y79itPCU', 'en', 'CK Hutchison Holdings Limited', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('h7H$Y79itPCU', 'zh-hans', '长江和记实业有限公司', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('h7H$Y79itPCU', 'zh-hant', '長江和記實業有限公司', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('lcOh5eHwTEUx', 'en', 'public', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('lcOh5eHwTEUx', 'zh-hans', '公共', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('lcOh5eHwTEUx', 'zh-hant', '公開', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('usK2qv9i28$5', 'en', 'City Super', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('usK2qv9i28$5', 'zh-hans', '城市超级', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('usK2qv9i28$5', 'zh-hant', '城超', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('wL1sp825MAAC', 'en', 'Meal Sharing Restaurant', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('wL1sp825MAAC', 'zh-hans', '餐食分享餐厅', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('wL1sp825MAAC', 'zh-hant', '飯食館', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('x4Cs_vYhWP_2', 'en', 'YaTa', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('x4Cs_vYhWP_2', 'zh-hans', '亚塔', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('x4Cs_vYhWP_2', 'zh-hant', '亞塔', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('z9ea1F98AHXh', 'en', 'DFI Retail Group (Diary Farm)', 0)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('z9ea1F98AHXh', 'zh-hans', 'DFI零售集团（Diary Farm）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";

INSERT INTO "propertyValueI18n" ("propertyValueId", "locale", "value", "valueGen")
VALUES ('z9ea1F98AHXh', 'zh-hant', 'DFI零售集團（Diary Farm）', 1)
ON CONFLICT("propertyValueId", "locale") DO UPDATE SET
  "value" = excluded."value",
  "valueGen" = excluded."valueGen";
