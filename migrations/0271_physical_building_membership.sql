-- Refs #194. A physical HYPE Building contains independently identifiable catalogue Buildings.
-- Keep the existing scope, assertion chain and cycle checks for every physical membership.
DROP TRIGGER locationMembership_kinds;
CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN NOT (
 ((SELECT matchingType FROM location WHERE id=NEW.childLocationId) IN ('building','premises') AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='premises')
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building_part' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId) IN ('building','building_part','premises'))
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='building'
   AND EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.childLocationId AND json_extract(rawSource,'$.kind')='building-export-baseline')
   AND EXISTS(SELECT 1 FROM locationRevision WHERE locationId=NEW.parentLocationId AND version=1 AND json_extract(rawSource,'$.kind')='physical-building-member')))
BEGIN SELECT RAISE(ABORT,'Invalid physical membership kinds'); END;

-- Backfill only explicit building choices. Address relationships never establish containment.
CREATE TABLE _0271_members AS
SELECT r.id parentRevisionId,r.locationId parentId,r.createdAt,
 json_extract(r.rawSource,'$.actorId') actor,l.ownerOrganisationId owner,
 json_extract(r.rawSource,'$.member') member,json_extract(r.rawSource,'$.member.source.id') sourceId,
 coalesce((SELECT child.id FROM locationRevision b JOIN location child ON child.id=b.locationId
   WHERE json_extract(b.rawSource,'$.buildingSource.id')=json_extract(r.rawSource,'$.member.source.id')
   AND json_extract(b.rawSource,'$.kind')='building-export-baseline' AND child.state NOT IN ('manual','redirect')
   AND child.matchingType='building' ORDER BY b.createdAt,child.id LIMIT 1),
   'building-member:'||json_extract(r.rawSource,'$.member.source.id')) childId
FROM locationRevision r JOIN location l ON l.id=r.locationId
WHERE json_extract(r.rawSource,'$.kind')='physical-building-member' AND l.state!='redirect' AND l.matchingType='building';

-- A historical choice could predate the first HYPE import. Materialize its retained point
-- and published label once, independently of the parent's edited name, address or geometry.
CREATE TABLE _0271_missing AS SELECT * FROM (
 SELECT m.*,row_number() OVER(PARTITION BY childId ORDER BY createdAt,parentRevisionId) choice
 FROM _0271_members m WHERE NOT EXISTS(SELECT 1 FROM location WHERE id=m.childId)
) WHERE choice=1;
INSERT INTO location(id,ownerOrganisationId,state,sourceAvailability,kind,class,createdAt)
SELECT childId,owner,'unresolved','current','built','building',createdAt FROM _0271_missing;
INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts,createdAt)
SELECT 'source:'||parentRevisionId,childId,1,'local','composition-backfill:'||parentRevisionId,
 json_object('kind','building-export-baseline','buildingSource',json_extract(member,'$.source'),'retainedMemberRevisionId',parentRevisionId,'organisationId',owner,'actorId',actor),
 json_object('schemaVersion',1,'kind','building','details',json('{}'),'common',json_object('location',json_object(
 'geometry',json_object('type','Point','coordinates',json_extract(member,'$.coordinates')),
 'address',json_object('status','unresolved','address2dId',NULL,'address3dId',NULL,'address3dUnitId',NULL,'snapshotId',NULL,'rawSource',json('{}')))),
 'i18n',json((SELECT json_group_object(key,json_object('displayAddress',value)) FROM json_each((
   SELECT a.value->'$.display' FROM json_each(member,'$.addresses') a
   WHERE a.value->>'$.id'=member->>'$.source.addressId'
      OR (member->>'$.source.addressId' IS NULL AND json_array_length(member,'$.addresses')=1)
 ))))),createdAt
FROM _0271_missing;

INSERT INTO locationMembership(id,relationshipId,childLocationId,parentLocationId,assertionState,membershipState,evidence,provenance,actorId,recordedAt)
SELECT 'composition:'||m.parentRevisionId,'composition:'||m.parentRevisionId,m.childId,m.parentId,'asserted','current',
 json_array(json_object('source',json_object('kind','record','resourceType','locationRevision','revisionId',b.id),'supports',json_array('membershipState'),
 'description','Reviewed constituent building.','quotedText',NULL,'sourceDate',NULL)),
 json_object('process','physical-building-composition','parentRevisionId',m.parentRevisionId,'childRevisionId',b.id),m.actor,m.createdAt
FROM _0271_members m JOIN locationRevision b ON b.locationId=m.childId AND b.version=1;
DROP TABLE _0271_missing;
DROP TABLE _0271_members;

CREATE TRIGGER location_composition_kind_update BEFORE UPDATE OF kind,class ON location
WHEN OLD.matchingType='building' AND coalesce(NEW.class,NEW.kind)!='building'
 AND EXISTS(SELECT 1 FROM locationMembershipHead m JOIN location p ON p.id=m.parentLocationId
   JOIN location c ON c.id=m.childLocationId WHERE (p.id=OLD.id OR c.id=OLD.id)
   AND p.matchingType='building' AND c.matchingType='building' AND m.assertionState='asserted' AND m.membershipState='current')
BEGIN SELECT RAISE(ABORT,'Reconcile physical building composition before changing Location kind'); END;

-- A grouping revision and its identity-to-identity assertion commit together.
CREATE TRIGGER location_composition_member AFTER INSERT ON locationRevision
WHEN json_extract(NEW.rawSource,'$.kind')='physical-building-member'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM locationRevision c JOIN location l ON l.id=c.locationId
   WHERE c.id=json_extract(NEW.rawSource,'$.member.childRevisionId') AND l.matchingType='building'
   AND l.state NOT IN ('manual','redirect') AND EXISTS(SELECT 1 FROM locationRevision b WHERE b.locationId=l.id
     AND json_extract(b.rawSource,'$.kind')='building-export-baseline'
     AND json_extract(b.rawSource,'$.buildingSource.id')=json_extract(NEW.rawSource,'$.member.source.id')))
 THEN RAISE(ABORT,'Select an imported constituent Building revision') END;

 INSERT INTO locationMembership(id,relationshipId,childLocationId,parentLocationId,assertionState,membershipState,evidence,provenance,actorId)
 SELECT 'composition:'||NEW.id,'composition:'||NEW.id,c.locationId,NEW.locationId,'asserted','current',
   json_array(json_object('source',json_object('kind','record','resourceType','locationRevision','revisionId',c.id),'supports',json_array('membershipState'),
   'description','Reviewed constituent building.','quotedText',NULL,'sourceDate',NULL)),
   json_object('process','physical-building-composition','parentRevisionId',NEW.id,'childRevisionId',c.id),json_extract(NEW.rawSource,'$.actorId')
 FROM locationRevision c WHERE c.id=json_extract(NEW.rawSource,'$.member.childRevisionId');
END;
