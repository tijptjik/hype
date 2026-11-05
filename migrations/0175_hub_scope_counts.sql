-- Repair databases that applied the original ownership-only version of 0174.
-- Also safe after corrected 0174: replace only derived counts and their triggers.
DROP TRIGGER IF EXISTS hub_counts_code;
DROP TRIGGER IF EXISTS hub_counts_create;
DROP TRIGGER IF EXISTS hub_counts_layer_delete;
DROP TRIGGER IF EXISTS hub_counts_layer_insert;
DROP TRIGGER IF EXISTS hub_counts_layer_move;
DROP TRIGGER IF EXISTS hub_counts_layer_move_after;
DROP TRIGGER IF EXISTS hub_counts_layer_move_before;
DROP TRIGGER IF EXISTS hub_counts_organisation_delete;
DROP TRIGGER IF EXISTS hub_counts_organisation_insert;
DROP TRIGGER IF EXISTS hub_counts_organisation_move;
DROP TRIGGER IF EXISTS hub_counts_organisation_policy_after;
DROP TRIGGER IF EXISTS hub_counts_organisation_policy_before;
DROP TRIGGER IF EXISTS hub_counts_project_delete;
DROP TRIGGER IF EXISTS hub_counts_project_insert;
DROP TRIGGER IF EXISTS hub_counts_project_move;
DROP TRIGGER IF EXISTS hub_counts_project_move_after;
DROP TRIGGER IF EXISTS hub_counts_project_move_before;
DELETE FROM hubCounts;
-- Bound descendant lookups during policy changes, transfers and deletes.
CREATE INDEX IF NOT EXISTS hub_counts_project_owner ON project(organisationId);
CREATE INDEX IF NOT EXISTS hub_counts_layer_project ON layer(projectId);
CREATE INDEX IF NOT EXISTS hub_counts_organisation_hub ON organisation(hubId);

-- One-time backfill; subsequent mutations apply deltas in the same transaction.
INSERT INTO hubCounts SELECT h.id,
  (SELECT count(*) FROM organisation o WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id))),
  (SELECT count(*) FROM project p JOIN organisation o ON o.id=p.organisationId WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id))),
  (SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)))
FROM hub h;
-- Creating core after organisations exist must include the existing eligible corpus.
CREATE TRIGGER hub_counts_create AFTER INSERT ON hub BEGIN
  INSERT INTO hubCounts SELECT NEW.id,
  (SELECT count(*) FROM organisation o WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id))),
  (SELECT count(*) FROM project p JOIN organisation o ON o.id=p.organisationId WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id))),
  (SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id)));
END;
-- A code change can change whether this row represents core; rebuild only this hub.
CREATE TRIGGER hub_counts_code AFTER UPDATE OF code ON hub WHEN OLD.code IS NOT NEW.code BEGIN
  UPDATE hubCounts SET
  organisationCount=(SELECT count(*) FROM organisation o WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id))),
  projectCount=(SELECT count(*) FROM project p JOIN organisation o ON o.id=p.organisationId WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id))),
  layerCount=(SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE ((NEW.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (NEW.code<>'core' AND o.hubId=NEW.id))) WHERE hubId=NEW.id;
END;
CREATE TRIGGER hub_counts_organisation_insert AFTER INSERT ON organisation BEGIN
  UPDATE hubCounts SET organisationCount=organisationCount+1
  WHERE hubId IN (SELECT h.id FROM hub h WHERE ((h.code='core' AND NEW.isCoreInclusive=1 AND (NEW.hubId IS NULL OR NEW.isHubExclusive=0)) OR (h.code<>'core' AND NEW.hubId=h.id)));
END;
-- Subtract descendants before cascade deletes remove their ownership lookup.
CREATE TRIGGER hub_counts_organisation_delete BEFORE DELETE ON organisation BEGIN
  UPDATE hubCounts SET organisationCount=organisationCount-1,
    projectCount=projectCount-(SELECT count(*) FROM project WHERE organisationId=OLD.id),
    layerCount=layerCount-(SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId WHERE p.organisationId=OLD.id)
  WHERE hubId IN (SELECT h.id FROM hub h WHERE ((h.code='core' AND OLD.isCoreInclusive=1 AND (OLD.hubId IS NULL OR OLD.isHubExclusive=0)) OR (h.code<>'core' AND OLD.hubId=h.id)));
END;
-- Remove the old scope before a policy change, then add the new scope after it.
-- Skip hub ID rename cascades, but process SET NULL on deletion (core eligibility can change).
CREATE TRIGGER hub_counts_organisation_policy_before BEFORE UPDATE OF hubId,isCoreInclusive,isHubExclusive ON organisation
WHEN (OLD.hubId IS NOT NEW.hubId OR OLD.isCoreInclusive IS NOT NEW.isCoreInclusive OR OLD.isHubExclusive IS NOT NEW.isHubExclusive) AND (NEW.hubId IS NULL OR OLD.hubId IS NULL OR EXISTS (SELECT 1 FROM hub WHERE id=OLD.hubId)) BEGIN
  UPDATE hubCounts SET organisationCount=organisationCount-1,
    projectCount=projectCount-(SELECT count(*) FROM project WHERE organisationId=OLD.id),
    layerCount=layerCount-(SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId WHERE p.organisationId=OLD.id)
  WHERE hubId IN (SELECT h.id FROM hub h WHERE ((h.code='core' AND OLD.isCoreInclusive=1 AND (OLD.hubId IS NULL OR OLD.isHubExclusive=0)) OR (h.code<>'core' AND OLD.hubId=h.id)));
END;
CREATE TRIGGER hub_counts_organisation_policy_after AFTER UPDATE OF hubId,isCoreInclusive,isHubExclusive ON organisation
WHEN (OLD.hubId IS NOT NEW.hubId OR OLD.isCoreInclusive IS NOT NEW.isCoreInclusive OR OLD.isHubExclusive IS NOT NEW.isHubExclusive) AND (NEW.hubId IS NULL OR OLD.hubId IS NULL OR EXISTS (SELECT 1 FROM hub WHERE id=OLD.hubId)) BEGIN
  UPDATE hubCounts SET organisationCount=organisationCount+1,
    projectCount=projectCount+(SELECT count(*) FROM project WHERE organisationId=NEW.id),
    layerCount=layerCount+(SELECT count(*) FROM layer l JOIN project p ON p.id=l.projectId WHERE p.organisationId=NEW.id)
  WHERE hubId IN (SELECT h.id FROM hub h WHERE ((h.code='core' AND NEW.isCoreInclusive=1 AND (NEW.hubId IS NULL OR NEW.isHubExclusive=0)) OR (h.code<>'core' AND NEW.hubId=h.id)));
END;
CREATE TRIGGER hub_counts_project_insert AFTER INSERT ON project BEGIN
  UPDATE hubCounts SET projectCount=projectCount+1
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) WHERE o.id=NEW.organisationId);
END;
CREATE TRIGGER hub_counts_project_delete BEFORE DELETE ON project BEGIN
  UPDATE hubCounts SET projectCount=projectCount-1,
    layerCount=layerCount-(SELECT count(*) FROM layer WHERE projectId=OLD.id)
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) WHERE o.id=OLD.organisationId);
END;
-- Project transfers carry their layers; organisation ID renames preserve membership.
CREATE TRIGGER hub_counts_project_move_before BEFORE UPDATE OF organisationId ON project
WHEN OLD.organisationId IS NOT NEW.organisationId AND EXISTS (SELECT 1 FROM organisation WHERE id=OLD.organisationId) BEGIN
  UPDATE hubCounts SET projectCount=projectCount-1,
    layerCount=layerCount-(SELECT count(*) FROM layer WHERE projectId=OLD.id)
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) WHERE o.id=OLD.organisationId);
END;
CREATE TRIGGER hub_counts_project_move_after AFTER UPDATE OF organisationId ON project
WHEN OLD.organisationId IS NOT NEW.organisationId AND EXISTS (SELECT 1 FROM organisation WHERE id=OLD.organisationId) BEGIN
  UPDATE hubCounts SET projectCount=projectCount+1,
    layerCount=layerCount+(SELECT count(*) FROM layer WHERE projectId=NEW.id)
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) WHERE o.id=NEW.organisationId);
END;
CREATE TRIGGER hub_counts_layer_insert AFTER INSERT ON layer BEGIN
  UPDATE hubCounts SET layerCount=layerCount+1
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) JOIN project p ON p.organisationId=o.id WHERE p.id=NEW.projectId);
END;
CREATE TRIGGER hub_counts_layer_delete AFTER DELETE ON layer BEGIN
  UPDATE hubCounts SET layerCount=layerCount-1
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) JOIN project p ON p.organisationId=o.id WHERE p.id=OLD.projectId);
END;
-- Layer transfers follow the project; project ID renames preserve membership.
CREATE TRIGGER hub_counts_layer_move_before BEFORE UPDATE OF projectId ON layer
WHEN OLD.projectId IS NOT NEW.projectId AND EXISTS (SELECT 1 FROM project WHERE id=OLD.projectId) BEGIN
  UPDATE hubCounts SET layerCount=layerCount-1
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) JOIN project p ON p.organisationId=o.id WHERE p.id=OLD.projectId);
END;
CREATE TRIGGER hub_counts_layer_move_after AFTER UPDATE OF projectId ON layer
WHEN OLD.projectId IS NOT NEW.projectId AND EXISTS (SELECT 1 FROM project WHERE id=OLD.projectId) BEGIN
  UPDATE hubCounts SET layerCount=layerCount+1
  WHERE hubId IN (SELECT h.id FROM hub h JOIN organisation o ON ((h.code='core' AND o.isCoreInclusive=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (h.code<>'core' AND o.hubId=h.id)) JOIN project p ON p.organisationId=o.id WHERE p.id=NEW.projectId);
END;
