-- Refs #194. Version Location revision facts without changing source evidence or accepted projections.
-- Capture historical kind from retained provenance, not a later identity reclassification.
-- Unknown historical classifications stay unknown; no location/source IDs or content hashes change.
CREATE TABLE _location_fact_snapshot_kind(id TEXT PRIMARY KEY,kind TEXT NOT NULL);
INSERT INTO _location_fact_snapshot_kind
 SELECT current.id,COALESCE((SELECT CASE
 WHEN json_extract(r.payload,'$.typeChange.after') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.payload,'$.typeChange.after')
 WHEN json_extract(r.facts,'$.entity.kind') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.facts,'$.entity.kind')
 WHEN r.origin='saanseoi' OR r.ssId IS NOT NULL THEN 'establishment'
 WHEN json_extract(r.payload,'$.kind')='breadline-place-import' THEN CASE WHEN json_extract(r.payload,'$.sourceTable')='donors' THEN 'establishment' ELSE 'unknown' END
 WHEN json_extract(r.payload,'$.kind')='existing-feature-split' THEN 'unknown'
 WHEN json_extract(r.payload,'$.input.kind') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.payload,'$.input.kind')
 END FROM locationRevision r WHERE r.locationId=current.locationId AND r.sequence<=current.sequence AND CASE
 WHEN json_extract(r.payload,'$.typeChange.after') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.payload,'$.typeChange.after')
 WHEN json_extract(r.facts,'$.entity.kind') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.facts,'$.entity.kind')
 WHEN r.origin='saanseoi' OR r.ssId IS NOT NULL THEN 'establishment'
 WHEN json_extract(r.payload,'$.kind')='breadline-place-import' THEN CASE WHEN json_extract(r.payload,'$.sourceTable')='donors' THEN 'establishment' ELSE 'unknown' END
 WHEN json_extract(r.payload,'$.kind')='existing-feature-split' THEN 'unknown'
 WHEN json_extract(r.payload,'$.input.kind') IN ('unknown','establishment','building','natural','address') THEN json_extract(r.payload,'$.input.kind')
 END IS NOT NULL ORDER BY r.sequence DESC LIMIT 1),'unknown')
 FROM locationRevision current WHERE json_type(current.facts,'$.schemaVersion') IS NULL;
CREATE TABLE _location_fact_snapshot_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _location_fact_snapshot_guard SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM locationRevision r JOIN _location_fact_snapshot_kind k ON k.id=r.id
 WHERE k.kind NOT IN ('unknown','establishment') AND (json_array_length(r.facts,'$.brands')>0 OR json_extract(r.facts,'$.operatingStatus') IS NOT NULL)
) THEN 1 ELSE 0 END;
DROP TABLE _location_fact_snapshot_guard;
DROP TRIGGER location_revision_no_update;
UPDATE locationRevision SET facts=json_object(
 'schemaVersion',1,
 'kind',(SELECT kind FROM _location_fact_snapshot_kind WHERE id=locationRevision.id),
 'common',json(CASE WHEN json_type(facts,'$.successorLocationId') IS NOT NULL THEN json_set(json_object('names',json_extract(facts,'$.names'),'location',json_extract(facts,'$.location'),'phoneNumber',json_extract(facts,'$.phoneNumber')),'$.successorLocationId',json_extract(facts,'$.successorLocationId')) ELSE json_object('names',json_extract(facts,'$.names'),'location',json_extract(facts,'$.location'),'phoneNumber',json_extract(facts,'$.phoneNumber')) END),
 'details',json(CASE (SELECT kind FROM _location_fact_snapshot_kind WHERE id=locationRevision.id) WHEN 'establishment' THEN CASE WHEN json_type(facts,'$.operatingStatus') IS NOT NULL THEN json_set(json_object('brands',json_extract(facts,'$.brands')),'$.operatingStatus',json_extract(facts,'$.operatingStatus')) ELSE json_object('brands',json_extract(facts,'$.brands')) END WHEN 'building' THEN CASE WHEN json_type(facts,'$.buildingStatus') IS NOT NULL THEN json_set(COALESCE(json_extract(facts,'$.entity.details'),'{}'),'$.buildingStatus',json_extract(facts,'$.buildingStatus')) ELSE COALESCE(json_extract(facts,'$.entity.details'),'{}') END WHEN 'natural' THEN COALESCE(json_extract(facts,'$.entity.details'),'{}') WHEN 'unknown' THEN CASE WHEN json_type(facts,'$.buildingStatus') IS NOT NULL THEN json_set(CASE WHEN json_type(facts,'$.operatingStatus') IS NOT NULL THEN json_set(json_object('brands',json_extract(facts,'$.brands')),'$.operatingStatus',json_extract(facts,'$.operatingStatus')) ELSE json_object('brands',json_extract(facts,'$.brands')) END,'$.buildingStatus',json_extract(facts,'$.buildingStatus')) ELSE CASE WHEN json_type(facts,'$.operatingStatus') IS NOT NULL THEN json_set(json_object('brands',json_extract(facts,'$.brands')),'$.operatingStatus',json_extract(facts,'$.operatingStatus')) ELSE json_object('brands',json_extract(facts,'$.brands')) END END ELSE '{}' END)
) WHERE id IN (SELECT id FROM _location_fact_snapshot_kind);
CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;
DROP TABLE _location_fact_snapshot_kind;

-- Runtime validators check the complete discriminated contract. This guard rejects old/unversioned writers.
CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
 OR COALESCE(json_extract(NEW.facts,'$.kind') IN ('unknown','establishment','building','natural','address'),0)=0
 OR json_type(NEW.facts,'$.common') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.names') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.location') IS NOT 'object'
 OR json_type(NEW.facts,'$.details') IS NOT 'object'
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND json_type(NEW.facts,'$.details.brands') IS NOT 'array')
BEGIN SELECT RAISE(ABORT,'Location revisions require a versioned typed facts snapshot'); END;
