-- Refs #194. Immutable relationship assertions and exact accepted placement references.
-- No tenancy, lineage or accepted movement is inferred from existing address text.
ALTER TABLE location ADD COLUMN nextKind TEXT NOT NULL DEFAULT 'unknown'
 CHECK(nextKind IN ('unknown','premises','establishment','building','address','natural'));
UPDATE location SET nextKind=kind;
ALTER TABLE location DROP COLUMN kind;
ALTER TABLE location RENAME COLUMN nextKind TO kind;
DROP TRIGGER location_revision_snapshot_insert;
CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
 OR COALESCE(json_extract(NEW.facts,'$.kind') IN ('unknown','premises','establishment','building','natural','address'),0)=0
 OR json_type(NEW.facts,'$.common') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.names') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.location') IS NOT 'object'
 OR json_type(NEW.facts,'$.details') IS NOT 'object'
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND json_type(NEW.facts,'$.details.brands') IS NOT 'array')
BEGIN SELECT RAISE(ABORT,'Location revisions require a versioned typed facts snapshot'); END;

CREATE TABLE address (
 id TEXT PRIMARY KEY NOT NULL,
 sourceKey TEXT NOT NULL CHECK(json_valid(sourceKey) AND json_type(sourceKey,'$.provider') IS 'text' AND json_type(sourceKey,'$.family') IS 'text' AND json_type(sourceKey,'$.id') IS 'text')
);
CREATE UNIQUE INDEX address_source_identity ON address(json_extract(sourceKey,'$.provider'),json_extract(sourceKey,'$.family'),json_extract(sourceKey,'$.id'));
CREATE TABLE addressRevision (
 id TEXT PRIMARY KEY NOT NULL,
 addressId TEXT NOT NULL REFERENCES address(id),
 scope TEXT NOT NULL CHECK(scope IN ('unknown','premises','phase','building','section','floor','unit','unit_portion')),
 components TEXT NOT NULL CHECK(json_valid(components)),
 geometry TEXT CHECK(geometry IS NULL OR (json_valid(geometry) AND json_extract(geometry,'$.type')='Point')),
 sourceVersion TEXT,
 contentHash TEXT NOT NULL,
 sourceReferences TEXT NOT NULL CHECK(json_valid(sourceReferences) AND json_type(sourceReferences)='array'),
 rawSource TEXT NOT NULL CHECK(json_valid(rawSource)),
 createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(addressId,contentHash)
);

CREATE TABLE locationAddress (
 id TEXT PRIMARY KEY NOT NULL,
 relationshipId TEXT NOT NULL,
 previousRevisionId TEXT REFERENCES locationAddress(id),
 scopeOrganisationId TEXT REFERENCES organisation(id),
 assertionState TEXT NOT NULL DEFAULT 'asserted' CHECK(assertionState IN ('asserted','suppressed')),
 evidence TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence) AND json_type(evidence)='array'),
 observedAt TEXT,
 verifiedAt TEXT,
 effectiveFrom TEXT,
 effectiveTo TEXT,
 effectiveFromPrecision TEXT CHECK(effectiveFromPrecision IN ('day','month','year','decade')),
 effectiveToPrecision TEXT CHECK(effectiveToPrecision IN ('day','month','year','decade')),
 provenance TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance)),
 actorId TEXT,
 recordedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 locationId TEXT NOT NULL REFERENCES location(id),
 addressRevisionId TEXT NOT NULL REFERENCES addressRevision(id),
 priority INTEGER CHECK(priority IS NULL OR (typeof(priority)='integer' AND priority>=0)),
 coverage TEXT CHECK(coverage IN ('whole','part')),
 addressState TEXT NOT NULL CHECK(addressState IN ('current','former','unconfirmed')),
 CHECK((effectiveFrom IS NULL)=(effectiveFromPrecision IS NULL)),
 CHECK((effectiveTo IS NULL)=(effectiveToPrecision IS NULL))
);

CREATE UNIQUE INDEX locationAddress_root ON locationAddress(relationshipId,COALESCE(scopeOrganisationId,'')) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX locationAddress_successor ON locationAddress(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE TRIGGER locationAddress_chain BEFORE INSERT ON locationAddress
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationAddress p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationAddress p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;

CREATE INDEX locationAddress_locationId ON locationAddress(locationId,relationshipId);

CREATE TRIGGER locationAddress_locationId_scope BEFORE INSERT ON locationAddress
WHEN NEW.locationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.locationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;

CREATE TABLE locationMembership (
 id TEXT PRIMARY KEY NOT NULL,
 relationshipId TEXT NOT NULL,
 previousRevisionId TEXT REFERENCES locationMembership(id),
 scopeOrganisationId TEXT REFERENCES organisation(id),
 assertionState TEXT NOT NULL DEFAULT 'asserted' CHECK(assertionState IN ('asserted','suppressed')),
 evidence TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence) AND json_type(evidence)='array'),
 observedAt TEXT,
 verifiedAt TEXT,
 effectiveFrom TEXT,
 effectiveTo TEXT,
 effectiveFromPrecision TEXT CHECK(effectiveFromPrecision IN ('day','month','year','decade')),
 effectiveToPrecision TEXT CHECK(effectiveToPrecision IN ('day','month','year','decade')),
 provenance TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance)),
 actorId TEXT,
 recordedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 childLocationId TEXT NOT NULL REFERENCES location(id),
 parentLocationId TEXT NOT NULL REFERENCES location(id),
 membershipState TEXT NOT NULL CHECK(membershipState IN ('current','former','unconfirmed')),
 CHECK(childLocationId!=parentLocationId),
 CHECK((effectiveFrom IS NULL)=(effectiveFromPrecision IS NULL)),
 CHECK((effectiveTo IS NULL)=(effectiveToPrecision IS NULL))
);

CREATE UNIQUE INDEX locationMembership_root ON locationMembership(relationshipId,COALESCE(scopeOrganisationId,'')) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX locationMembership_successor ON locationMembership(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE TRIGGER locationMembership_chain BEFORE INSERT ON locationMembership
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationMembership p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationMembership p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;

CREATE INDEX locationMembership_childLocationId ON locationMembership(childLocationId,relationshipId);

CREATE TRIGGER locationMembership_childLocationId_scope BEFORE INSERT ON locationMembership
WHEN NEW.childLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.childLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;

CREATE INDEX locationMembership_parentLocationId ON locationMembership(parentLocationId,relationshipId);

CREATE TRIGGER locationMembership_parentLocationId_scope BEFORE INSERT ON locationMembership
WHEN NEW.parentLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.parentLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;

CREATE TABLE locationOccupancy (
 id TEXT PRIMARY KEY NOT NULL,
 relationshipId TEXT NOT NULL,
 previousRevisionId TEXT REFERENCES locationOccupancy(id),
 scopeOrganisationId TEXT REFERENCES organisation(id),
 assertionState TEXT NOT NULL DEFAULT 'asserted' CHECK(assertionState IN ('asserted','suppressed')),
 evidence TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence) AND json_type(evidence)='array'),
 observedAt TEXT,
 verifiedAt TEXT,
 effectiveFrom TEXT,
 effectiveTo TEXT,
 effectiveFromPrecision TEXT CHECK(effectiveFromPrecision IN ('day','month','year','decade')),
 effectiveToPrecision TEXT CHECK(effectiveToPrecision IN ('day','month','year','decade')),
 provenance TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance)),
 actorId TEXT,
 recordedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 establishmentLocationId TEXT NOT NULL REFERENCES location(id),
 containerLocationId TEXT REFERENCES location(id),
 addressRevisionId TEXT REFERENCES addressRevision(id),
 occupancyState TEXT NOT NULL CHECK(occupancyState IN ('current','former','unconfirmed')),
 CHECK(containerLocationId IS NOT NULL OR addressRevisionId IS NOT NULL),
 CHECK((effectiveFrom IS NULL)=(effectiveFromPrecision IS NULL)),
 CHECK((effectiveTo IS NULL)=(effectiveToPrecision IS NULL))
);

CREATE UNIQUE INDEX locationOccupancy_root ON locationOccupancy(relationshipId,COALESCE(scopeOrganisationId,'')) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX locationOccupancy_successor ON locationOccupancy(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE TRIGGER locationOccupancy_chain BEFORE INSERT ON locationOccupancy
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationOccupancy p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationOccupancy p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;

CREATE INDEX locationOccupancy_establishmentLocationId ON locationOccupancy(establishmentLocationId,relationshipId);

CREATE TRIGGER locationOccupancy_establishmentLocationId_scope BEFORE INSERT ON locationOccupancy
WHEN NEW.establishmentLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.establishmentLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;

CREATE INDEX locationOccupancy_containerLocationId ON locationOccupancy(containerLocationId,relationshipId);

CREATE TRIGGER locationOccupancy_containerLocationId_scope BEFORE INSERT ON locationOccupancy
WHEN NEW.containerLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.containerLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;

CREATE TABLE locationTransition (
 id TEXT PRIMARY KEY NOT NULL,
 transitionId TEXT NOT NULL,
 previousRevisionId TEXT REFERENCES locationTransition(id),
 scopeOrganisationId TEXT REFERENCES organisation(id),
 assertionState TEXT NOT NULL DEFAULT 'asserted' CHECK(assertionState IN ('asserted','suppressed')),
 evidence TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence) AND json_type(evidence)='array'),
 observedAt TEXT,
 verifiedAt TEXT,
 effectiveFrom TEXT,
 effectiveTo TEXT,
 effectiveFromPrecision TEXT CHECK(effectiveFromPrecision IN ('day','month','year','decade')),
 effectiveToPrecision TEXT CHECK(effectiveToPrecision IN ('day','month','year','decade')),
 provenance TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance)),
 actorId TEXT,
 recordedAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 type TEXT NOT NULL CHECK(type IN ('replacement','merge','split','reconfiguration')),
 basis TEXT NOT NULL CHECK(basis IN ('real_world','identity_correction')),
 CHECK((effectiveFrom IS NULL)=(effectiveFromPrecision IS NULL)),
 CHECK((effectiveTo IS NULL)=(effectiveToPrecision IS NULL))
);

CREATE UNIQUE INDEX locationTransition_root ON locationTransition(transitionId,COALESCE(scopeOrganisationId,'')) WHERE previousRevisionId IS NULL;
CREATE UNIQUE INDEX locationTransition_successor ON locationTransition(previousRevisionId) WHERE previousRevisionId IS NOT NULL;
CREATE TRIGGER locationTransition_chain BEFORE INSERT ON locationTransition
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationTransition p WHERE p.id=NEW.previousRevisionId AND p.transitionId=NEW.transitionId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.transitionId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationTransition p WHERE p.transitionId=NEW.transitionId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;

CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN (SELECT kind FROM location WHERE id=NEW.childLocationId) NOT IN ('building','premises')
 OR (SELECT kind FROM location WHERE id=NEW.parentLocationId)!='premises'
BEGIN SELECT RAISE(ABORT,'Membership requires a building or premises within premises'); END;
CREATE TRIGGER locationOccupancy_kinds BEFORE INSERT ON locationOccupancy
WHEN (SELECT kind FROM location WHERE id=NEW.establishmentLocationId)!='establishment'
 OR (NEW.containerLocationId IS NOT NULL AND (SELECT kind FROM location WHERE id=NEW.containerLocationId) NOT IN ('building','premises'))
BEGIN SELECT RAISE(ABORT,'Occupancy requires an establishment and building or premises'); END;
CREATE TABLE locationTransitionParticipant (
 transitionRevisionId TEXT NOT NULL REFERENCES locationTransition(id),
 locationId TEXT NOT NULL REFERENCES location(id),
 side TEXT NOT NULL CHECK(side IN ('before','after')),
 PRIMARY KEY(transitionRevisionId,locationId,side)
);
CREATE INDEX locationTransitionParticipant_location ON locationTransitionParticipant(locationId,transitionRevisionId);
CREATE TRIGGER locationTransitionParticipant_scope BEFORE INSERT ON locationTransitionParticipant
WHEN NOT EXISTS(SELECT 1 FROM location l JOIN locationTransition t ON t.id=NEW.transitionRevisionId WHERE l.id=NEW.locationId AND (l.state!='manual' OR l.ownerOrganisationId IS t.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Transition participant unavailable in scope'); END;

ALTER TABLE featureLocation ADD COLUMN occupancyRevisionId TEXT REFERENCES locationOccupancy(id);

ALTER TABLE featureLocation ADD COLUMN addressRevisionId TEXT REFERENCES addressRevision(id);

ALTER TABLE featureLocation ADD COLUMN membershipRevisionIds TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(membershipRevisionIds) AND json_type(membershipRevisionIds)='array');

ALTER TABLE featureLocation ADD COLUMN placementOverrides TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(placementOverrides));

ALTER TABLE featureLocationHistory ADD COLUMN occupancyRevisionId TEXT REFERENCES locationOccupancy(id);

ALTER TABLE featureLocationHistory ADD COLUMN addressRevisionId TEXT REFERENCES addressRevision(id);

ALTER TABLE featureLocationHistory ADD COLUMN membershipRevisionIds TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(membershipRevisionIds) AND json_type(membershipRevisionIds)='array');

ALTER TABLE featureLocationHistory ADD COLUMN placementOverrides TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(placementOverrides));

ALTER TABLE featureLocationHistory ADD COLUMN geometry TEXT;

ALTER TABLE featureLocationHistory ADD COLUMN policySnapshot TEXT;

ALTER TABLE featureLocationHistory ADD COLUMN adoptionProposalId TEXT;

CREATE TABLE featureLocationMembership (
 featureId TEXT NOT NULL REFERENCES featureLocation(featureId) ON DELETE CASCADE,
 containerLocationId TEXT NOT NULL REFERENCES location(id),
 role TEXT NOT NULL CHECK(role IN ('building','premises')),
 bindingVersion TEXT NOT NULL,
 occupancyRevisionId TEXT REFERENCES locationOccupancy(id),
 membershipRevisionId TEXT REFERENCES locationMembership(id),
 PRIMARY KEY(featureId,containerLocationId,role)
);
CREATE INDEX featureLocationMembership_container ON featureLocationMembership(containerLocationId,role,featureId);

CREATE TRIGGER address_no_update BEFORE UPDATE ON address BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER address_no_delete BEFORE DELETE ON address BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER addressRevision_no_update BEFORE UPDATE ON addressRevision BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER addressRevision_no_delete BEFORE DELETE ON addressRevision BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationAddress_no_update BEFORE UPDATE ON locationAddress BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationAddress_no_delete BEFORE DELETE ON locationAddress BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationMembership_no_update BEFORE UPDATE ON locationMembership BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationMembership_no_delete BEFORE DELETE ON locationMembership BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationOccupancy_no_update BEFORE UPDATE ON locationOccupancy BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationOccupancy_no_delete BEFORE DELETE ON locationOccupancy BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationTransition_no_update BEFORE UPDATE ON locationTransition BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationTransition_no_delete BEFORE DELETE ON locationTransition BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationTransitionParticipant_no_update BEFORE UPDATE ON locationTransitionParticipant BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

CREATE TRIGGER locationTransitionParticipant_no_delete BEFORE DELETE ON locationTransitionParticipant BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;

DROP TRIGGER feature_location_history_insert;

CREATE TRIGGER feature_location_history_insert AFTER INSERT ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,revision,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry)
 VALUES(NEW.featureId,NEW.revision,NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision,NEW.occupancyRevisionId,NEW.addressRevisionId,NEW.membershipRevisionIds,NEW.placementOverrides,NULL,'link',(SELECT geometry FROM feature WHERE id=NEW.featureId));
 END;

DROP TRIGGER feature_location_history_update;

CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,revision,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry)
 VALUES(NEW.featureId,NEW.revision,NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision,NEW.occupancyRevisionId,NEW.addressRevisionId,NEW.membershipRevisionIds,NEW.placementOverrides,OLD.revision,'update',NULL);
 END;

DROP TRIGGER feature_location_history_delete;

CREATE TRIGGER feature_location_history_delete AFTER DELETE ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,revision,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry)
 VALUES(OLD.featureId,OLD.revision,OLD.locationId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.acceptedOverrides,(SELECT json_extract(localLocationBrands,'$.actorId') FROM feature WHERE id=OLD.featureId AND json_extract(localLocationBrands,'$.sourceAssociationRevision')=OLD.revision),OLD.factsOrganisationRevision,OLD.locationOrganisationRevision,OLD.occupancyRevisionId,OLD.addressRevisionId,OLD.membershipRevisionIds,OLD.placementOverrides,OLD.revision,'unlink',(SELECT geometry FROM feature WHERE id=OLD.featureId));
 END;

CREATE VIEW locationAddressHead AS SELECT r.* FROM locationAddress r
 WHERE NOT EXISTS(SELECT 1 FROM locationAddress next WHERE next.previousRevisionId=r.id);

CREATE VIEW locationMembershipHead AS SELECT r.* FROM locationMembership r
 WHERE NOT EXISTS(SELECT 1 FROM locationMembership next WHERE next.previousRevisionId=r.id);

CREATE VIEW locationOccupancyHead AS SELECT r.* FROM locationOccupancy r
 WHERE NOT EXISTS(SELECT 1 FROM locationOccupancy next WHERE next.previousRevisionId=r.id);

CREATE VIEW locationTransitionHead AS SELECT r.* FROM locationTransition r
 WHERE NOT EXISTS(SELECT 1 FROM locationTransition next WHERE next.previousRevisionId=r.id);

-- Reject cycles in both baseline and every affected Organisation projection, including nested premises.
CREATE TRIGGER locationMembership_cycle BEFORE INSERT ON locationMembership
WHEN NEW.assertionState='asserted' AND NEW.membershipState='current' AND EXISTS(
 WITH RECURSIVE scopes(scope) AS (
  SELECT NEW.scopeOrganisationId UNION SELECT scopeOrganisationId FROM locationMembership WHERE NEW.scopeOrganisationId IS NULL
 ), edges(scope,child,parent) AS (
  SELECT s.scope,m.childLocationId,m.parentLocationId FROM scopes s JOIN locationMembershipHead m
  WHERE (m.scopeOrganisationId IS s.scope OR m.scopeOrganisationId IS NULL)
   AND (m.scopeOrganisationId IS NOT NULL OR NOT EXISTS(SELECT 1 FROM locationMembershipHead o WHERE o.relationshipId=m.relationshipId AND o.scopeOrganisationId IS s.scope AND s.scope IS NOT NULL))
   AND m.relationshipId!=NEW.relationshipId AND m.assertionState='asserted' AND m.membershipState='current'
 ), path(scope,id) AS (
  SELECT scope,NEW.parentLocationId FROM scopes UNION
  SELECT p.scope,e.parent FROM path p JOIN edges e ON e.scope IS p.scope AND e.child=p.id
 ) SELECT 1 FROM path WHERE id=NEW.childLocationId
) BEGIN SELECT RAISE(ABORT,'Premises membership cycle'); END;
CREATE TRIGGER locationAddress_effectiveFrom_date BEFORE INSERT ON locationAddress
 WHEN NEW.effectiveFrom IS NOT NULL AND NOT (
 (NEW.effectiveFromPrecision='year' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='decade' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0 AND CAST(NEW.effectiveFrom AS INTEGER)%10=0) OR
 (NEW.effectiveFromPrecision='month' AND length(NEW.effectiveFrom)=7 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveFrom,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='day' AND length(NEW.effectiveFrom)=10 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveFrom,'+0 days')=NEW.effectiveFrom,0) AND CAST(NEW.effectiveFrom AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationAddress_effectiveTo_date BEFORE INSERT ON locationAddress
 WHEN NEW.effectiveTo IS NOT NULL AND NOT (
 (NEW.effectiveToPrecision='year' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='decade' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0 AND CAST(NEW.effectiveTo AS INTEGER)%10=0) OR
 (NEW.effectiveToPrecision='month' AND length(NEW.effectiveTo)=7 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveTo,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='day' AND length(NEW.effectiveTo)=10 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveTo,'+0 days')=NEW.effectiveTo,0) AND CAST(NEW.effectiveTo AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationMembership_effectiveFrom_date BEFORE INSERT ON locationMembership
 WHEN NEW.effectiveFrom IS NOT NULL AND NOT (
 (NEW.effectiveFromPrecision='year' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='decade' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0 AND CAST(NEW.effectiveFrom AS INTEGER)%10=0) OR
 (NEW.effectiveFromPrecision='month' AND length(NEW.effectiveFrom)=7 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveFrom,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='day' AND length(NEW.effectiveFrom)=10 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveFrom,'+0 days')=NEW.effectiveFrom,0) AND CAST(NEW.effectiveFrom AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationMembership_effectiveTo_date BEFORE INSERT ON locationMembership
 WHEN NEW.effectiveTo IS NOT NULL AND NOT (
 (NEW.effectiveToPrecision='year' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='decade' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0 AND CAST(NEW.effectiveTo AS INTEGER)%10=0) OR
 (NEW.effectiveToPrecision='month' AND length(NEW.effectiveTo)=7 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveTo,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='day' AND length(NEW.effectiveTo)=10 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveTo,'+0 days')=NEW.effectiveTo,0) AND CAST(NEW.effectiveTo AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationOccupancy_effectiveFrom_date BEFORE INSERT ON locationOccupancy
 WHEN NEW.effectiveFrom IS NOT NULL AND NOT (
 (NEW.effectiveFromPrecision='year' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='decade' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0 AND CAST(NEW.effectiveFrom AS INTEGER)%10=0) OR
 (NEW.effectiveFromPrecision='month' AND length(NEW.effectiveFrom)=7 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveFrom,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='day' AND length(NEW.effectiveFrom)=10 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveFrom,'+0 days')=NEW.effectiveFrom,0) AND CAST(NEW.effectiveFrom AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationOccupancy_effectiveTo_date BEFORE INSERT ON locationOccupancy
 WHEN NEW.effectiveTo IS NOT NULL AND NOT (
 (NEW.effectiveToPrecision='year' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='decade' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0 AND CAST(NEW.effectiveTo AS INTEGER)%10=0) OR
 (NEW.effectiveToPrecision='month' AND length(NEW.effectiveTo)=7 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveTo,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='day' AND length(NEW.effectiveTo)=10 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveTo,'+0 days')=NEW.effectiveTo,0) AND CAST(NEW.effectiveTo AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationTransition_effectiveFrom_date BEFORE INSERT ON locationTransition
 WHEN NEW.effectiveFrom IS NOT NULL AND NOT (
 (NEW.effectiveFromPrecision='year' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='decade' AND length(NEW.effectiveFrom)=4 AND NEW.effectiveFrom NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveFrom AS INTEGER)>0 AND CAST(NEW.effectiveFrom AS INTEGER)%10=0) OR
 (NEW.effectiveFromPrecision='month' AND length(NEW.effectiveFrom)=7 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveFrom,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveFrom AS INTEGER)>0) OR
 (NEW.effectiveFromPrecision='day' AND length(NEW.effectiveFrom)=10 AND NEW.effectiveFrom GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveFrom,'+0 days')=NEW.effectiveFrom,0) AND CAST(NEW.effectiveFrom AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;
CREATE TRIGGER locationTransition_effectiveTo_date BEFORE INSERT ON locationTransition
 WHEN NEW.effectiveTo IS NOT NULL AND NOT (
 (NEW.effectiveToPrecision='year' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='decade' AND length(NEW.effectiveTo)=4 AND NEW.effectiveTo NOT GLOB '*[^0-9]*' AND CAST(NEW.effectiveTo AS INTEGER)>0 AND CAST(NEW.effectiveTo AS INTEGER)%10=0) OR
 (NEW.effectiveToPrecision='month' AND length(NEW.effectiveTo)=7 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.effectiveTo,6,2) BETWEEN '01' AND '12' AND CAST(NEW.effectiveTo AS INTEGER)>0) OR
 (NEW.effectiveToPrecision='day' AND length(NEW.effectiveTo)=10 AND NEW.effectiveTo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(NEW.effectiveTo,'+0 days')=NEW.effectiveTo,0) AND CAST(NEW.effectiveTo AS INTEGER)>0))
 BEGIN SELECT RAISE(ABORT,'Invalid historical date'); END;

CREATE TRIGGER feature_location_placement_insert BEFORE INSERT ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=o.containerLocationId OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND o.establishmentLocationId=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=m.childLocationId JOIN location parent ON parent.id=m.parentLocationId
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT m.childLocationId,m.parentLocationId FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT containerLocationId FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT m.parentLocationId FROM reached r JOIN locationMembership m ON m.childLocationId=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE m.childLocationId NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;
CREATE TRIGGER feature_location_grouping_insert AFTER INSERT ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.revision,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT containerLocationId FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,m.parentLocationId,'premises',NEW.revision,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY m.parentLocationId;
 END;

CREATE TRIGGER feature_location_placement_update BEFORE UPDATE ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=o.containerLocationId OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND o.establishmentLocationId=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=m.childLocationId JOIN location parent ON parent.id=m.parentLocationId
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT m.childLocationId,m.parentLocationId FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT containerLocationId FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT m.parentLocationId FROM reached r JOIN locationMembership m ON m.childLocationId=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE m.childLocationId NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;
CREATE TRIGGER feature_location_grouping_update AFTER UPDATE ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.revision,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT containerLocationId FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,m.parentLocationId,'premises',NEW.revision,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY m.parentLocationId;
 END;

INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion)
 SELECT f.featureId,f.locationId,l.kind,f.revision FROM featureLocation f JOIN location l ON l.id=f.locationId WHERE l.kind IN ('building','premises');

-- Reclassification must explicitly reconcile current physical assertions first.
CREATE TRIGGER location_relationship_kind_update BEFORE UPDATE OF kind ON location
WHEN NEW.kind!=OLD.kind AND (
 (NEW.kind!='establishment' AND EXISTS(SELECT 1 FROM locationOccupancyHead WHERE establishmentLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current'))
 OR (NEW.kind NOT IN ('building','premises') AND (EXISTS(SELECT 1 FROM locationOccupancyHead WHERE containerLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current') OR EXISTS(SELECT 1 FROM locationMembershipHead WHERE childLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
 OR (NEW.kind!='premises' AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE parentLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
BEGIN SELECT RAISE(ABORT,'Reconcile current relationships before changing Location kind'); END;
