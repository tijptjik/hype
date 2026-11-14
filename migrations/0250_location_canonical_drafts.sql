-- Refs #194. Shared canonical drafts retain normal Hype identities and NULL ssId.
-- Rebuild without renaming so existing external triggers and views retain their references.
-- Location foreign keys are RESTRICT/NO ACTION; no cascade deletion is permitted.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE __location_draft_copy AS SELECT "id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind","class","lastManualMatchAttemptAt" FROM location;

DROP TABLE location;

CREATE TABLE "location" (
  id TEXT PRIMARY KEY NOT NULL,
  ssId TEXT UNIQUE,
  ownerOrganisationId TEXT REFERENCES organisation(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('linked','unresolved','manual','redirect')),
  sourceAvailability TEXT NOT NULL DEFAULT 'current' CHECK(sourceAvailability IN ('current','missing','review')),
  redirectTargetId TEXT REFERENCES "location"(id) ON DELETE RESTRICT,
  redirect TEXT CHECK(redirect IS NULL OR (json_valid(redirect)
    AND json_extract(redirect,'$.sourceLocationId') IS id
    AND json_extract(redirect,'$.targetLocationId') IS redirectTargetId
    AND redirectTargetId IS NOT NULL AND redirectTargetId!=id
    AND json_type(redirect,'$.id') IS 'text' AND json_type(redirect,'$.reviewId') IS 'text'
    AND COALESCE(length(trim(json_extract(redirect,'$.actorId')))>0,0)
    AND COALESCE(length(trim(json_extract(redirect,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(redirect,'$.createdAt') IS 'text')),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK(kind IN ('unknown','built','geographic','operational','address')), class TEXT
 CHECK((kind='operational' AND class IS NOT NULL AND class IN ('establishment','service_point')) OR (kind!='operational' AND class IS NULL) OR (kind='built' AND class IN ('premises','building','building_part','structure','thoroughfare'))
   OR (kind='geographic' AND class IN ('landform','coastal_feature','water_feature'))), matchingType TEXT GENERATED ALWAYS AS
 (CASE WHEN class='thoroughfare' THEN 'street' ELSE COALESCE(class,CASE kind WHEN 'geographic' THEN 'natural' ELSE kind END) END) VIRTUAL, lastManualMatchAttemptAt TEXT,
  CHECK((state='linked' AND ssId IS NOT NULL) OR
    (state='unresolved' AND ssId IS NULL) OR
    (state='manual' AND ssId IS NULL AND ownerOrganisationId IS NOT NULL) OR
    (state='redirect' AND ssId IS NULL))
);

INSERT INTO location("id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind","class","lastManualMatchAttemptAt") SELECT "id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind","class","lastManualMatchAttemptAt" FROM __location_draft_copy;

DROP TABLE __location_draft_copy;

CREATE INDEX location_owner_organisation ON location(ownerOrganisationId,id);

CREATE INDEX location_redirect_destination ON location(redirectTargetId) WHERE redirectTargetId IS NOT NULL;

CREATE UNIQUE INDEX location_redirect_receipt ON location(json_extract(redirect,'$.id')) WHERE redirect IS NOT NULL;

CREATE UNIQUE INDEX location_redirect_review ON location(json_extract(redirect,'$.reviewId')) WHERE redirect IS NOT NULL;

CREATE TRIGGER feature_location_owner_scope BEFORE UPDATE OF ownerOrganisationId ON location
WHEN NEW.state='manual' AND NEW.ownerOrganisationId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featureLocation fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.locationId = OLD.id AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT NEW.ownerOrganisationId
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;

CREATE TRIGGER feature_name_location_scope AFTER UPDATE OF state,ownerOrganisationId ON location BEGIN
 UPDATE featureI18n SET title=(SELECT title FROM featureComputedName n WHERE n.featureId=featureI18n.featureId AND n.locale=featureI18n.locale)
 WHERE featureId IN (SELECT featureId FROM featureLocation WHERE locationId=NEW.id);
END;

CREATE TRIGGER location_linked_shared_insert BEFORE INSERT ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;

CREATE TRIGGER location_linked_shared_update BEFORE UPDATE ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;

CREATE TRIGGER location_redirect_no_delete BEFORE DELETE ON location WHEN OLD.redirect IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Location redirects are immutable'); END;

CREATE TRIGGER location_redirect_no_initial BEFORE INSERT ON location
WHEN NEW.state='redirect' OR NEW.redirect IS NOT NULL OR NEW.redirectTargetId IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Location redirects must retain an existing identity'); END;

CREATE TRIGGER location_redirect_no_reactivate BEFORE UPDATE ON location WHEN OLD.state='redirect'
BEGIN SELECT RAISE(ABORT,'Redirected Location identities are immutable'); END;

CREATE TRIGGER location_redirect_state BEFORE UPDATE OF state ON location
WHEN NEW.state='redirect' AND (NEW.redirect IS NULL OR NEW.redirectTargetId IS NULL
  OR EXISTS(SELECT 1 FROM featureLocation WHERE locationId=NEW.id))
BEGIN SELECT RAISE(ABORT,'Location redirect requires retained identity and migrated associations'); END;

CREATE TRIGGER location_redirect_target_immutable BEFORE UPDATE OF redirectTargetId ON location
WHEN OLD.redirect IS NOT NULL AND NEW.redirectTargetId IS NOT OLD.redirectTargetId
BEGIN SELECT RAISE(ABORT,'Location redirects are immutable'); END;

CREATE TRIGGER location_redirect_valid BEFORE UPDATE OF redirect,redirectTargetId ON location
WHEN NEW.redirect IS NOT OLD.redirect AND (OLD.redirect IS NOT NULL OR OLD.state='redirect'
  OR NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.redirectTargetId AND state!='redirect')
  OR NOT EXISTS(SELECT 1 FROM locationIdentityReview r,json_each(r.mergeReviews) m
    WHERE json_extract(m.value,'$.id')=json_extract(NEW.redirect,'$.reviewId') AND r.rejection IS NULL
      AND json_extract(m.value,'$.sourceLocationId')=NEW.id AND r.locationId=NEW.redirectTargetId))
BEGIN SELECT RAISE(ABORT,'Location redirect requires an unrejected review and two current identities'); END;

CREATE TRIGGER location_relationship_kind_update BEFORE UPDATE OF kind, class ON location
WHEN NEW.kind IS NOT OLD.kind OR NEW.class IS NOT OLD.class
BEGIN
 SELECT CASE WHEN
  COALESCE(NEW.class,CASE NEW.kind WHEN 'geographic' THEN 'natural' ELSE NEW.kind END)='building_part'
  OR COALESCE(OLD.class,CASE OLD.kind WHEN 'geographic' THEN 'natural' ELSE OLD.kind END)='building_part'
  OR EXISTS(SELECT 1 FROM locationOccupancyHead o JOIN location host ON host.id=o.containerLocationId
    WHERE o.establishmentLocationId=NEW.id AND o.assertionState='asserted' AND o.occupancyState='current'
    AND (NEW.kind!='operational' OR NEW.class NOT IN ('establishment','service_point')
      OR (host.matchingType='establishment' AND NEW.class!='service_point')))
  OR (NEW.kind!='operational' AND EXISTS(SELECT 1 FROM locationOccupancyHead
    WHERE establishmentLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current'))
  OR EXISTS(SELECT 1 FROM locationOccupancyHead o JOIN location occupant ON occupant.id=o.establishmentLocationId
    WHERE o.containerLocationId=NEW.id AND o.assertionState='asserted' AND o.occupancyState='current'
    AND NOT ((NEW.kind='built' AND NEW.class IN ('building','premises','structure'))
      OR (NEW.kind='operational' AND NEW.class='establishment' AND occupant.matchingType='service_point')))
  OR (COALESCE(NEW.class,NEW.kind) NOT IN ('building','premises') AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE childLocationId=NEW.id AND assertionState='asserted' AND membershipState='current'))
  OR (COALESCE(NEW.class,NEW.kind)!='premises' AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE parentLocationId=NEW.id AND assertionState='asserted' AND membershipState='current'))
 THEN RAISE(ABORT,'Reconcile current relationships before changing Location kind') END;
END;

-- Source identity survives publication and is also the upload correlation key.
CREATE TABLE locationCanonicalDraft (
 locationId TEXT PRIMARY KEY NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
 sourceKey TEXT UNIQUE NOT NULL,
 createdBy TEXT NOT NULL,
 createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER location_canonical_draft_insert BEFORE INSERT ON locationCanonicalDraft
WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state='unresolved' AND ssId IS NULL AND ownerOrganisationId IS NULL)
BEGIN SELECT RAISE(ABORT,'Canonical draft requires a shared unpublished Location'); END;
CREATE TRIGGER location_canonical_draft_no_update BEFORE UPDATE ON locationCanonicalDraft
BEGIN SELECT RAISE(ABORT,'Canonical draft source identity is immutable'); END;
CREATE TRIGGER location_canonical_draft_no_delete BEFORE DELETE ON locationCanonicalDraft
BEGIN SELECT RAISE(ABORT,'Canonical draft source identity is retained after publication'); END;


DROP TRIGGER locationMembership_kinds;

CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN NOT (
 ((SELECT matchingType FROM location WHERE id=NEW.childLocationId) IN ('building','premises') AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='premises')
 OR ((SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building_part' AND (SELECT matchingType FROM location WHERE id=NEW.parentLocationId) IN ('building','building_part','premises')))
BEGIN SELECT RAISE(ABORT,'Invalid physical membership kinds'); END;

DROP TRIGGER locationMembership_part_owner;

CREATE TRIGGER locationMembership_part_owner BEFORE INSERT ON locationMembership
WHEN (SELECT matchingType FROM location WHERE id=NEW.childLocationId)='building_part'
 OR EXISTS(SELECT 1 FROM locationMembership old JOIN location child ON child.id=old.childLocationId
   WHERE old.relationshipId=NEW.relationshipId AND child.matchingType='building_part')
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM locationMembership old JOIN location p ON p.id=old.parentLocationId
   WHERE old.relationshipId=NEW.relationshipId AND p.matchingType IN ('building','premises')
   AND (NEW.childLocationId!=old.childLocationId OR NEW.parentLocationId!=old.parentLocationId
     OR NEW.assertionState!='asserted' OR NEW.membershipState!='current'))
 THEN RAISE(ABORT,'Building part ownership cannot be removed or reassigned') END;
 SELECT CASE WHEN NEW.assertionState='asserted' AND NEW.membershipState='current' AND (
   ((SELECT matchingType FROM location WHERE id=NEW.parentLocationId) IN ('building','premises') AND EXISTS(
     SELECT 1 FROM locationMembershipHead m JOIN location p ON p.id=m.parentLocationId
     WHERE m.childLocationId=NEW.childLocationId AND p.matchingType IN ('building','premises') AND m.parentLocationId!=NEW.parentLocationId))
   OR ((SELECT matchingType FROM location WHERE id=NEW.parentLocationId)='building_part' AND NOT EXISTS(
     SELECT 1 FROM locationMembershipHead child JOIN locationMembershipHead parent ON parent.parentLocationId=child.parentLocationId
     JOIN location b ON b.id=child.parentLocationId AND b.matchingType IN ('building','premises')
     WHERE child.childLocationId=NEW.childLocationId AND parent.childLocationId=NEW.parentLocationId
       AND child.assertionState='asserted' AND child.membershipState='current'
       AND parent.assertionState='asserted' AND parent.membershipState='current')))
 THEN RAISE(ABORT,'Building parts must belong to the same identified building or premises') END;
END;
