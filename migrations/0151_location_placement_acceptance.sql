-- Refs #194. Immutable placement acceptance receipts are captured with the binding.
ALTER TABLE featureLocation ADD COLUMN acceptedGeometry TEXT CHECK(acceptedGeometry IS NULL OR json_valid(acceptedGeometry));
ALTER TABLE featureLocation ADD COLUMN acceptancePolicy TEXT CHECK(acceptancePolicy IS NULL OR json_valid(acceptancePolicy));
ALTER TABLE featureLocation ADD COLUMN acceptanceProposalId TEXT REFERENCES locationAdoptionProposal(id);
DROP TRIGGER feature_location_history_update;
CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,revision,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry,policySnapshot,adoptionProposalId)
 VALUES(NEW.featureId,NEW.revision,NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision,NEW.occupancyRevisionId,NEW.addressRevisionId,NEW.membershipRevisionIds,NEW.placementOverrides,OLD.revision,'update',NEW.acceptedGeometry,NEW.acceptancePolicy,NEW.acceptanceProposalId);
 END;
-- A changed dependency snapshot can require reassessment without changing the Feature or policy.
DROP INDEX location_adoption_candidate;
CREATE UNIQUE INDEX location_adoption_candidate ON locationAdoptionProposal(featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,organisationRevision,COALESCE(occupancyRevisionId,''),COALESCE(addressRevisionId,''),COALESCE(layerId,''),COALESCE(layerPolicyRevision,-1),COALESCE(json_extract(evidence,'$.placement'),''));
