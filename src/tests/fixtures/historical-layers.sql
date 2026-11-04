-- Refs #194: persistent derived historical layers. Feature flags remain editorial.
ALTER TABLE layer ADD COLUMN historicalSourceLayerId TEXT REFERENCES layer(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX layer_historical_source_idx ON layer(historicalSourceLayerId)
  WHERE historicalSourceLayerId IS NOT NULL;

-- A derived layer belongs to the same ancestry as its ordinary source, never another derivative.
CREATE TRIGGER historical_layer_validate_insert BEFORE INSERT ON layer
WHEN NEW.historicalSourceLayerId IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM layer s WHERE s.id=NEW.historicalSourceLayerId
    AND s.historicalSourceLayerId IS NULL AND s.projectId=NEW.projectId
    AND s.organisationId=NEW.organisationId) THEN RAISE(ABORT,'INVALID_HISTORICAL_LAYER_SOURCE') END;
END;
CREATE TRIGGER historical_layer_validate_update BEFORE UPDATE OF historicalSourceLayerId ON layer
WHEN NEW.historicalSourceLayerId IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM layer s WHERE s.id=NEW.historicalSourceLayerId
    AND s.historicalSourceLayerId IS NULL AND s.projectId=NEW.projectId
    AND s.organisationId=NEW.organisationId) THEN RAISE(ABORT,'INVALID_HISTORICAL_LAYER_SOURCE') END;
END;
CREATE TRIGGER historical_layer_lock BEFORE UPDATE OF historicalSourceLayerId,projectId,organisationId ON layer
WHEN OLD.historicalSourceLayerId IS NOT NULL AND
 (NEW.historicalSourceLayerId IS NOT OLD.historicalSourceLayerId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.organisationId IS NOT OLD.organisationId) BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_LAYER_PARENT_LOCKED');
END;
CREATE TRIGGER historical_source_parent_lock BEFORE UPDATE OF projectId,organisationId ON layer
WHEN (NEW.projectId IS NOT OLD.projectId OR NEW.organisationId IS NOT OLD.organisationId)
 AND EXISTS(SELECT 1 FROM layer WHERE historicalSourceLayerId=OLD.id) BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_SOURCE_PARENT_LOCKED');
END;
CREATE TRIGGER historical_layer_delete BEFORE DELETE ON layer
WHEN OLD.historicalSourceLayerId IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_LAYER_MANAGED');
END;

-- Preserve the existing child row and all its settings across repeated enable/disable operations.
CREATE TRIGGER historical_project_enable AFTER UPDATE OF flags ON project
WHEN json_extract(NEW.flags,'$.showHistoricalLayers')=1 BEGIN
  INSERT INTO layer(id,organisationId,projectId,historicalSourceLayerId,metadata,rank,isDefaultVisible,isPublished,isArchived)
    SELECT 'history:'||s.id,s.organisationId,s.projectId,s.id,s.metadata,s.rank+1,
      s.isDefaultVisible,s.isPublished,s.isArchived FROM layer s
    WHERE s.projectId=NEW.id AND s.historicalSourceLayerId IS NULL AND s.isArchived=0
      AND NOT EXISTS(SELECT 1 FROM layer h WHERE h.historicalSourceLayerId=s.id);

END;
CREATE TRIGGER historical_source_create AFTER INSERT ON layer
WHEN NEW.historicalSourceLayerId IS NULL AND
  (SELECT json_extract(flags,'$.showHistoricalLayers') FROM project WHERE id=NEW.projectId)=1 BEGIN
  INSERT INTO layer(id,organisationId,projectId,historicalSourceLayerId,metadata,rank,isDefaultVisible,isPublished,isArchived)
    VALUES('history:'||NEW.id,NEW.organisationId,NEW.projectId,NEW.id,NEW.metadata,NEW.rank+1,
      NEW.isDefaultVisible,NEW.isPublished,NEW.isArchived);
END;
-- Reactivating an old ordinary layer provisions its derivative through the same idempotent path.
CREATE TRIGGER historical_source_restore AFTER UPDATE OF isArchived ON layer
WHEN OLD.isArchived=1 AND NEW.isArchived=0 AND NEW.historicalSourceLayerId IS NULL
BEGIN UPDATE project SET flags=flags WHERE id=NEW.projectId AND json_extract(flags,'$.showHistoricalLayers')=1; END;
CREATE TRIGGER historical_source_translation AFTER INSERT ON layerI18n BEGIN
  INSERT OR IGNORE INTO layerI18n(layerId,locale,name,nameShort,nameGen,nameShortGen)
    SELECT id,NEW.locale,substr(NEW.name,1,110)||CASE NEW.locale WHEN 'en' THEN ' — Historic' ELSE ' — 歷史' END,
      CASE NEW.locale WHEN 'en' THEN 'Historic' WHEN 'zh-hans' THEN '历史' ELSE '歷史' END,0,0
    FROM layer WHERE historicalSourceLayerId=NEW.layerId;
END;

-- Route within the same Project only. Repeated routing is a no-op, including with recursive triggers enabled.
CREATE TRIGGER historical_feature_insert AFTER INSERT ON feature BEGIN
  UPDATE feature SET layerId=(SELECT CASE WHEN NEW.isIntangible=1 AND json_extract(p.flags,'$.showHistoricalLayers')=1
    THEN coalesce((SELECT h.id FROM layer h WHERE h.historicalSourceLayerId=coalesce(l.historicalSourceLayerId,l.id)),l.id)
    ELSE coalesce(l.historicalSourceLayerId,l.id) END FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=NEW.layerId)
  WHERE id=NEW.id;
END;
CREATE TRIGGER historical_feature_update AFTER UPDATE OF isIntangible,layerId ON feature
WHEN NEW.layerId IS NOT (SELECT CASE WHEN NEW.isIntangible=1 AND json_extract(p.flags,'$.showHistoricalLayers')=1
    THEN coalesce((SELECT h.id FROM layer h WHERE h.historicalSourceLayerId=coalesce(l.historicalSourceLayerId,l.id)),l.id)
    ELSE coalesce(l.historicalSourceLayerId,l.id) END FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=NEW.layerId)
BEGIN
  UPDATE feature SET layerId=(SELECT CASE WHEN NEW.isIntangible=1 AND json_extract(p.flags,'$.showHistoricalLayers')=1
    THEN coalesce((SELECT h.id FROM layer h WHERE h.historicalSourceLayerId=coalesce(l.historicalSourceLayerId,l.id)),l.id)
    ELSE coalesce(l.historicalSourceLayerId,l.id) END FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=NEW.layerId)
  WHERE id=NEW.id;
END;
-- Layer insertion finishes before routing, regardless of trigger execution order on Project flags.
CREATE TRIGGER historical_child_route AFTER INSERT ON layer WHEN NEW.historicalSourceLayerId IS NOT NULL BEGIN
  INSERT OR IGNORE INTO layerI18n(layerId,locale,name,nameShort,nameGen,nameShortGen)
    SELECT h.id,i.locale,substr(i.name,1,110)||CASE i.locale WHEN 'en' THEN ' — Historic' ELSE ' — 歷史' END,
      CASE i.locale WHEN 'en' THEN 'Historic' WHEN 'zh-hans' THEN '历史' ELSE '歷史' END,0,0
    FROM layer h JOIN layerI18n i ON i.layerId=h.historicalSourceLayerId WHERE h.id=NEW.id;
  INSERT OR IGNORE INTO layerProperty(layerId,propertyId,isVisible,isUserContributable)
    SELECT h.id,lp.propertyId,lp.isVisible,lp.isUserContributable
    FROM layer h JOIN layerProperty lp ON lp.layerId=h.historicalSourceLayerId
    WHERE h.id=NEW.id;
  UPDATE feature SET layerId=NEW.id,modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE layerId=NEW.historicalSourceLayerId AND isIntangible=1
      AND (SELECT json_extract(flags,'$.showHistoricalLayers') FROM project WHERE id=NEW.projectId)=1;
END;
CREATE TRIGGER historical_project_route AFTER UPDATE OF flags ON project
WHEN coalesce(json_extract(NEW.flags,'$.showHistoricalLayers'),0) != coalesce(json_extract(OLD.flags,'$.showHistoricalLayers'),0) BEGIN
  UPDATE feature SET layerId=layerId,modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE projectId=NEW.id AND isIntangible=1;
END;

-- Historical routing can update layerId during INSERT, before the spatial INSERT
-- trigger runs. Read the stored placement and upsert so trigger ordering neither
-- duplicates H3 rows nor restores the original layer's stale map membership.
DROP TRIGGER IF EXISTS feature_spatial_insert;
CREATE TRIGGER feature_spatial_insert AFTER INSERT ON feature
WHEN NEW.spatialIndex IS NOT NULL
BEGIN
  INSERT INTO featureSpatial(featureId,resolution,cell,layerId,longitude,latitude)
  SELECT f.id,CAST(cells.key AS integer),cells.value,f.layerId,
    json_extract(f.spatialIndex,'$.longitude'),json_extract(f.spatialIndex,'$.latitude')
  FROM feature f,json_each(f.spatialIndex,'$.cells') cells
  WHERE f.id=NEW.id AND f.spatialIndex IS NOT NULL
    AND json(json_extract(f.spatialIndex,'$.geometry'))=json(f.geometry)
    AND json_extract(f.geometry,'$.type')='Point'
  ON CONFLICT(featureId,resolution) DO UPDATE SET cell=excluded.cell,
    layerId=excluded.layerId,longitude=excluded.longitude,latitude=excluded.latitude;
END;
