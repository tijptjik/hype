-- Refs #194. Canonical drafts await publication, not ordinary source rematching.
DROP VIEW locationRematchEligible;
CREATE VIEW locationRematchEligible AS
SELECT f.id featureId,f.projectId,fl.locationId,l.ownerOrganisationId,l.matchingType AS kind,
  json_object('modifiedAt',f.modifiedAt,'version',fl.version,'addressMeta',f.addressMeta,
    'projectId',f.projectId,'owner',l.ownerOrganisationId,'kind',l.matchingType,'locationId',l.id,
    'revisionId',(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1),
    'historyId',(SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=l.id AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))) intent,
  f.addressMeta
FROM feature f JOIN project p ON p.id=f.projectId
JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId
WHERE f.isDraft=0 AND f.isArchived=0 AND l.ssId IS NULL AND l.state IN ('manual','unresolved')
  AND l.ownerOrganisationId=p.organisationId
  AND json_extract(f.addressMeta,'$.address.association.mode')='unlinked'
  AND json_extract(f.addressMeta,'$.address.association.kind')=l.matchingType
  AND NOT EXISTS(SELECT 1 FROM locationRevision lr WHERE lr.locationId=l.id
    AND lr.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
    AND json_extract(lr.rawSource,'$.buildingSource.id') IS NOT NULL)
  AND (json_extract(f.addressMeta,'$.address.association.targetId') IS NULL
    OR json_extract(f.addressMeta,'$.address.association.targetId') IN (l.id,'location:'||l.id));
