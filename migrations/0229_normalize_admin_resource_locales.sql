-- Normalize admin-resource translation identities after fixing the shared relation writer.
-- SvelteKit form keys remain encoded; persisted locale columns use zh-hans/zh-hant.
-- D1 applies migrations atomically. Abort on collisions rather than discard translations.
-- Existing immutable snapshots stay intact; enrolled resources receive new current revisions.
CREATE TABLE _locale_normalization_guard (ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE _locale_normalization_targets (
  resource TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(resource,id)
);

-- hub: verify both projection and current snapshot before opening revision capture.
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM hubI18n old JOIN hubI18n canonical ON canonical.hubId=old.hubId
  AND canonical.locale=CASE old.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  WHERE old.locale IN ('zhHans','zhHant')
);
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM hubRevisionHead h JOIN hubRevision r ON r.id=h.currentRevisionId,
    json_each(r.content,'$.i18n') old, json_each(r.content,'$.i18n') canonical
  WHERE old.key IN ('zhHans','zhHant') AND canonical.key=CASE old.key
    WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
);
INSERT INTO _locale_normalization_targets(resource,id)
SELECT 'hub',hubId FROM hubI18n WHERE locale IN ('zhHans','zhHant')
UNION
SELECT 'hub',h.hubId FROM hubRevisionHead h JOIN hubRevision r ON r.id=h.currentRevisionId
WHERE EXISTS (SELECT 1 FROM json_each(r.content,'$.i18n') WHERE key IN ('zhHans','zhHant'));
INSERT INTO hubRevisionWrite(hubId,token,revisionId,baselineRevisionId)
SELECT h.hubId,'migration-0229','migration-0229-hub-'||h.hubId,h.currentRevisionId
FROM hubRevisionHead h JOIN _locale_normalization_targets t ON t.resource='hub' AND t.id=h.hubId;

-- organisation: verify both projection and current snapshot before opening revision capture.
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM organisationI18n old JOIN organisationI18n canonical ON canonical.organisationId=old.organisationId
  AND canonical.locale=CASE old.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  WHERE old.locale IN ('zhHans','zhHant')
);
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM organisationRevisionHead h JOIN organisationRevision r ON r.id=h.currentRevisionId,
    json_each(r.content,'$.i18n') old, json_each(r.content,'$.i18n') canonical
  WHERE old.key IN ('zhHans','zhHant') AND canonical.key=CASE old.key
    WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
);
INSERT INTO _locale_normalization_targets(resource,id)
SELECT 'organisation',organisationId FROM organisationI18n WHERE locale IN ('zhHans','zhHant')
UNION
SELECT 'organisation',h.organisationId FROM organisationRevisionHead h JOIN organisationRevision r ON r.id=h.currentRevisionId
WHERE EXISTS (SELECT 1 FROM json_each(r.content,'$.i18n') WHERE key IN ('zhHans','zhHant'));
INSERT INTO organisationRevisionWrite(organisationId,token,revisionId,baselineRevisionId)
SELECT h.organisationId,'migration-0229','migration-0229-organisation-'||h.organisationId,h.currentRevisionId
FROM organisationRevisionHead h JOIN _locale_normalization_targets t ON t.resource='organisation' AND t.id=h.organisationId;

-- project: verify both projection and current snapshot before opening revision capture.
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM projectI18n old JOIN projectI18n canonical ON canonical.projectId=old.projectId
  AND canonical.locale=CASE old.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  WHERE old.locale IN ('zhHans','zhHant')
);
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM projectRevisionHead h JOIN projectRevision r ON r.id=h.currentRevisionId,
    json_each(r.content,'$.i18n') old, json_each(r.content,'$.i18n') canonical
  WHERE old.key IN ('zhHans','zhHant') AND canonical.key=CASE old.key
    WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
);
INSERT INTO _locale_normalization_targets(resource,id)
SELECT 'project',projectId FROM projectI18n WHERE locale IN ('zhHans','zhHant')
UNION
SELECT 'project',h.projectId FROM projectRevisionHead h JOIN projectRevision r ON r.id=h.currentRevisionId
WHERE EXISTS (SELECT 1 FROM json_each(r.content,'$.i18n') WHERE key IN ('zhHans','zhHant'));
INSERT INTO projectRevisionWrite(projectId,token,revisionId,baselineRevisionId)
SELECT h.projectId,'migration-0229','migration-0229-project-'||h.projectId,h.currentRevisionId
FROM projectRevisionHead h JOIN _locale_normalization_targets t ON t.resource='project' AND t.id=h.projectId;

-- layer: verify both projection and current snapshot before opening revision capture.
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM layerI18n old JOIN layerI18n canonical ON canonical.layerId=old.layerId
  AND canonical.locale=CASE old.locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
  WHERE old.locale IN ('zhHans','zhHant')
);
INSERT INTO _locale_normalization_guard
SELECT NOT EXISTS (
  SELECT 1 FROM layerRevisionHead h JOIN layerRevision r ON r.id=h.currentRevisionId,
    json_each(r.content,'$.i18n') old, json_each(r.content,'$.i18n') canonical
  WHERE old.key IN ('zhHans','zhHant') AND canonical.key=CASE old.key
    WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
);
INSERT INTO _locale_normalization_targets(resource,id)
SELECT 'layer',layerId FROM layerI18n WHERE locale IN ('zhHans','zhHant')
UNION
SELECT 'layer',h.layerId FROM layerRevisionHead h JOIN layerRevision r ON r.id=h.currentRevisionId
WHERE EXISTS (SELECT 1 FROM json_each(r.content,'$.i18n') WHERE key IN ('zhHans','zhHant'));
INSERT INTO layerRevisionWrite(layerId,token,revisionId,baselineRevisionId)
SELECT h.layerId,'migration-0229','migration-0229-layer-'||h.layerId,h.currentRevisionId
FROM layerRevisionHead h JOIN _locale_normalization_targets t ON t.resource='layer' AND t.id=h.layerId;

INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt)
SELECT 'migration-0229-locales','migration:0229','migration',
  'Normalize persisted translation locale codes',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM _locale_normalization_targets)
AND NOT EXISTS (SELECT 1 FROM revisionChangeSet WHERE id='migration-0229-locales');

-- hub: preserve translated text, metadata, revision ancestry and unrelated snapshot fields.
UPDATE hubI18n SET locale=CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
WHERE locale IN ('zhHans','zhHant');
INSERT INTO hubRevision(id,hubId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,r.hubId,r.id,'migration-0229-locales',
  json_set(r.content,'$.i18n',json((SELECT json_group_object(
    CASE key WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE key END,
    json(value)) FROM json_each(r.content,'$.i18n')))),r.schemaVersion
FROM hubRevisionWrite w JOIN hubRevision r ON r.id=w.baselineRevisionId
WHERE w.token='migration-0229';
UPDATE hubRevisionHead SET currentRevisionId=(SELECT w.revisionId FROM hubRevisionWrite w
  WHERE w.hubId=hubRevisionHead.hubId AND w.token='migration-0229'),generation=generation+1
WHERE hubId IN (SELECT hubId FROM hubRevisionWrite WHERE token='migration-0229');
DELETE FROM hubRevisionWrite WHERE token='migration-0229';

-- Reject regressions from older application writers and direct imports alike.
CREATE TRIGGER IF NOT EXISTS hubI18n_canonical_locale_insert BEFORE INSERT ON hubI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'hubI18n: normalize form locale keys before persistence'); END;
CREATE TRIGGER IF NOT EXISTS hubI18n_canonical_locale_update BEFORE UPDATE OF locale ON hubI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'hubI18n: normalize form locale keys before persistence'); END;

-- organisation: preserve translated text, metadata, revision ancestry and unrelated snapshot fields.
UPDATE organisationI18n SET locale=CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
WHERE locale IN ('zhHans','zhHant');
INSERT INTO organisationRevision(id,organisationId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,r.organisationId,r.id,'migration-0229-locales',
  json_set(r.content,'$.i18n',json((SELECT json_group_object(
    CASE key WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE key END,
    json(value)) FROM json_each(r.content,'$.i18n')))),r.schemaVersion
FROM organisationRevisionWrite w JOIN organisationRevision r ON r.id=w.baselineRevisionId
WHERE w.token='migration-0229';
UPDATE organisationRevisionHead SET currentRevisionId=(SELECT w.revisionId FROM organisationRevisionWrite w
  WHERE w.organisationId=organisationRevisionHead.organisationId AND w.token='migration-0229'),generation=generation+1
WHERE organisationId IN (SELECT organisationId FROM organisationRevisionWrite WHERE token='migration-0229');
DELETE FROM organisationRevisionWrite WHERE token='migration-0229';

-- Reject regressions from older application writers and direct imports alike.
CREATE TRIGGER IF NOT EXISTS organisationI18n_canonical_locale_insert BEFORE INSERT ON organisationI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'organisationI18n: normalize form locale keys before persistence'); END;
CREATE TRIGGER IF NOT EXISTS organisationI18n_canonical_locale_update BEFORE UPDATE OF locale ON organisationI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'organisationI18n: normalize form locale keys before persistence'); END;

-- project: preserve translated text, metadata, revision ancestry and unrelated snapshot fields.
UPDATE projectI18n SET locale=CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
WHERE locale IN ('zhHans','zhHant');
INSERT INTO projectRevision(id,projectId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,r.projectId,r.id,'migration-0229-locales',
  json_set(r.content,'$.i18n',json((SELECT json_group_object(
    CASE key WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE key END,
    json(value)) FROM json_each(r.content,'$.i18n')))),r.schemaVersion
FROM projectRevisionWrite w JOIN projectRevision r ON r.id=w.baselineRevisionId
WHERE w.token='migration-0229';
UPDATE projectRevisionHead SET currentRevisionId=(SELECT w.revisionId FROM projectRevisionWrite w
  WHERE w.projectId=projectRevisionHead.projectId AND w.token='migration-0229'),generation=generation+1
WHERE projectId IN (SELECT projectId FROM projectRevisionWrite WHERE token='migration-0229');
DELETE FROM projectRevisionWrite WHERE token='migration-0229';

-- Reject regressions from older application writers and direct imports alike.
CREATE TRIGGER IF NOT EXISTS projectI18n_canonical_locale_insert BEFORE INSERT ON projectI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'projectI18n: normalize form locale keys before persistence'); END;
CREATE TRIGGER IF NOT EXISTS projectI18n_canonical_locale_update BEFORE UPDATE OF locale ON projectI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'projectI18n: normalize form locale keys before persistence'); END;

-- layer: preserve translated text, metadata, revision ancestry and unrelated snapshot fields.
UPDATE layerI18n SET locale=CASE locale WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' END
WHERE locale IN ('zhHans','zhHant');
INSERT INTO layerRevision(id,layerId,previousRevisionId,changeSetId,content,schemaVersion)
SELECT w.revisionId,r.layerId,r.id,'migration-0229-locales',
  json_set(r.content,'$.i18n',json((SELECT json_group_object(
    CASE key WHEN 'zhHans' THEN 'zh-hans' WHEN 'zhHant' THEN 'zh-hant' ELSE key END,
    json(value)) FROM json_each(r.content,'$.i18n')))),r.schemaVersion
FROM layerRevisionWrite w JOIN layerRevision r ON r.id=w.baselineRevisionId
WHERE w.token='migration-0229';
UPDATE layerRevisionHead SET currentRevisionId=(SELECT w.revisionId FROM layerRevisionWrite w
  WHERE w.layerId=layerRevisionHead.layerId AND w.token='migration-0229'),generation=generation+1
WHERE layerId IN (SELECT layerId FROM layerRevisionWrite WHERE token='migration-0229');
DELETE FROM layerRevisionWrite WHERE token='migration-0229';

-- Reject regressions from older application writers and direct imports alike.
CREATE TRIGGER IF NOT EXISTS layerI18n_canonical_locale_insert BEFORE INSERT ON layerI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'layerI18n: normalize form locale keys before persistence'); END;
CREATE TRIGGER IF NOT EXISTS layerI18n_canonical_locale_update BEFORE UPDATE OF locale ON layerI18n
WHEN NEW.locale IN ('zhHans','zhHant')
BEGIN SELECT RAISE(ABORT,'layerI18n: normalize form locale keys before persistence'); END;

DROP TABLE _locale_normalization_targets;
DROP TABLE _locale_normalization_guard;
