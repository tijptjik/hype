-- Reorder physical audit columns and group user profile/contact/status/preferences.
-- Drizzle does not emit migrations for declaration-order-only changes.
-- Run through the transactional D1 migration runner; do not execute piecemeal.
-- Preserve rowids, immutable evidence, all dependent rows, indexes and triggers.
-- Foreign keys remain enabled. Deferred checks cover the temporary parent gaps.
-- Verification: dev-check python3 scripts/dev/test_audit_column_order.py

-- Retain legacy uniqueness guarantees before staging children.
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
CREATE UNIQUE INDEX IF NOT EXISTS hub_code_unique ON hub(code);
CREATE UNIQUE INDEX IF NOT EXISTS hub_domain_unique ON hub(domain);

CREATE TABLE __audit_column_order_guard(valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check);
-- Reject unknown dependent tables rather than allow an unstaged cascade.
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT 1 FROM sqlite_schema s,pragma_foreign_key_list(s.name) f WHERE s.type='table' AND f."table" IN ('account','breadlineImportFeature','breadlineImportIdentity','breadlineImportUser','feature','featureCountEntry','featureDivisionJob','featureDivisionMembership','featureI18n','featureImage','featureLocation','featureLocationHistory','featureLocationMembership','featureMtrJob','featureProperty','featurePropertyI18n','featureSearchDocument','featureSpatial','hub','hubI18n','hubLayer','hubProperty','hubRole','hubUserState','image','layer','layerI18n','layerProperty','location','locationAccessibility','locationAddress','locationAdoptionProposal','locationIdentityHistory','locationIdentityReview','locationMembership','locationOccupancy','locationRelationshipOperation','locationRematchJob','locationRematchReview','locationRevision','locationTransition','locationTransitionParticipant','mapStyleI18n','mapStyles','messagingAccount','messagingConversation','messagingMessage','messagingPhoneLookup','messagingSend','organisation','organisationI18n','organisationLocation','organisationProperty','organisationRole','organisationUserPolicy','passkey','project','projectI18n','projectMapStyles','projectProperty','projectRole','property','propertyI18n','propertyValue','propertyValueI18n','session','task','taskImage','user','userActivity','userFeature','userLayer','userMessagingIdentity','userMessagingIdentityAlias') AND s.name NOT IN ('account','breadlineImportFeature','breadlineImportIdentity','breadlineImportUser','feature','featureCountEntry','featureDivisionJob','featureDivisionMembership','featureI18n','featureImage','featureLocation','featureLocationHistory','featureLocationMembership','featureMtrJob','featureProperty','featurePropertyI18n','featureSearchDocument','featureSpatial','hub','hubI18n','hubLayer','hubProperty','hubRole','hubUserState','image','layer','layerI18n','layerProperty','location','locationAccessibility','locationAddress','locationAdoptionProposal','locationIdentityHistory','locationIdentityReview','locationMembership','locationOccupancy','locationRelationshipOperation','locationRematchJob','locationRematchReview','locationRevision','locationTransition','locationTransitionParticipant','mapStyleI18n','mapStyles','messagingAccount','messagingConversation','messagingMessage','messagingPhoneLookup','messagingSend','organisation','organisationI18n','organisationLocation','organisationProperty','organisationRole','organisationUserPolicy','passkey','project','projectI18n','projectMapStyles','projectProperty','projectRole','property','propertyI18n','propertyValue','propertyValueI18n','session','task','taskImage','user','userActivity','userFeature','userLayer','userMessagingIdentity','userMessagingIdentityAlias'));
-- Refuse pre-existing default drift rather than silently change new-user behavior.
CREATE TABLE __audit_user_default_guard(valid INTEGER NOT NULL CONSTRAINT audit_user_preferences_default_matches_baseline CHECK(valid=1));
INSERT INTO __audit_user_default_guard SELECT dflt_value IS '''{"fallbackLocales":["en","zh-hant"], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}''' FROM pragma_table_info('user') WHERE name='preferences';
DROP TABLE __audit_user_default_guard;
-- Unknown triggers or indexes require a new inventory; never silently discard them.
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name NOT IN ('addressRevision_no_delete','addressRevision_no_update','address_no_delete','address_no_update','division_i18n_insert','division_i18n_update','division_membership_delete','division_membership_insert','division_membership_update','division_translation_delete','division_translation_insert','division_translation_update','feature_count_cache_trim','feature_count_entry_delete','feature_count_entry_insert','feature_count_entry_update','feature_count_feature_delete','feature_count_feature_insert','feature_count_feature_update','feature_count_geometry_update','feature_count_i18n_delete','feature_count_i18n_insert','feature_count_i18n_revision_update','feature_count_revision_featureProperty_delete','feature_count_revision_featureProperty_insert','feature_count_revision_featureProperty_update','feature_count_revision_hubRole_delete','feature_count_revision_hubRole_insert','feature_count_revision_hubRole_update','feature_count_revision_hub_delete','feature_count_revision_hub_insert','feature_count_revision_hub_update','feature_count_revision_layer_delete','feature_count_revision_layer_insert','feature_count_revision_layer_update','feature_count_revision_organisationRole_delete','feature_count_revision_organisationRole_insert','feature_count_revision_organisationRole_update','feature_count_revision_organisation_delete','feature_count_revision_organisation_insert','feature_count_revision_organisation_update','feature_count_revision_projectRole_delete','feature_count_revision_projectRole_insert','feature_count_revision_projectRole_update','feature_count_revision_project_delete','feature_count_revision_project_insert','feature_count_revision_project_update','feature_count_user_delete','feature_count_user_insert','feature_count_user_update','feature_delete_translations','feature_division_create','feature_division_move','feature_division_projection_move','feature_location_clear_detached','feature_location_feature_scope','feature_location_grouping_insert','feature_location_grouping_update','feature_location_history_delete','feature_location_history_insert','feature_location_history_no_delete','feature_location_history_no_update','feature_location_history_update','feature_location_organisation_feature_move','feature_location_organisation_insert','feature_location_organisation_project_move','feature_location_organisation_update','feature_location_owner_scope','feature_location_placement_insert','feature_location_placement_update','feature_location_project_scope','feature_location_revision_insert','feature_location_revision_update','feature_location_scope_insert','feature_location_scope_update','feature_mtr_geometry','feature_mtr_insert','feature_mtr_walk_limit_insert','feature_mtr_walk_limit_update','feature_search_document_delete','feature_search_i18n_identity_update','feature_search_i18n_insert','feature_search_i18n_update','feature_spatial_insert','feature_spatial_update','historical_child_route','historical_feature_insert','historical_feature_update','historical_layer_delete','historical_layer_lock','historical_layer_validate_insert','historical_layer_validate_update','historical_project_enable','historical_project_route','historical_source_create','historical_source_parent_lock','historical_source_restore','historical_source_translation','locationAddress_chain','locationAddress_effectiveFrom_date','locationAddress_effectiveTo_date','locationAddress_locationId_scope','locationAddress_no_delete','locationAddress_no_update','locationMembership_chain','locationMembership_childLocationId_scope','locationMembership_cycle','locationMembership_effectiveFrom_date','locationMembership_effectiveTo_date','locationMembership_kinds','locationMembership_no_delete','locationMembership_no_update','locationMembership_parentLocationId_scope','locationOccupancy_chain','locationOccupancy_containerLocationId_scope','locationOccupancy_effectiveFrom_date','locationOccupancy_effectiveTo_date','locationOccupancy_establishmentLocationId_scope','locationOccupancy_kinds','locationOccupancy_no_delete','locationOccupancy_no_update','locationTransitionParticipant_no_delete','locationTransitionParticipant_no_update','locationTransitionParticipant_scope','locationTransition_chain','locationTransition_effectiveFrom_date','locationTransition_effectiveTo_date','locationTransition_no_delete','locationTransition_no_update','location_accessibility_insert','location_accessibility_no_delete','location_accessibility_no_update','location_adoption_proposal_no_delete','location_adoption_proposal_no_update','location_canonical_source_only','location_identity_history_no_delete','location_identity_history_no_update','location_identity_history_not_rejected','location_identity_merge_valid','location_identity_rejection_valid','location_identity_review_no_delete','location_identity_review_no_update','location_linked_shared_insert','location_linked_shared_update','location_local_change','location_redirect_no_delete','location_redirect_no_initial','location_redirect_no_reactivate','location_redirect_state','location_redirect_target_immutable','location_redirect_valid','location_relationship_kind_update','location_relationship_operation_immutable_delete','location_relationship_operation_immutable_update','location_revision_no_delete','location_revision_no_update','location_revision_snapshot_insert','location_revision_unknown_details','messaging_identity_verified_insert','messaging_identity_verified_update','organisationRole_default_grant','organisationRole_grant_insert','organisationRole_grant_update','organisationRole_last_grant','organisationRole_legacy_role_update','organisationRole_validate_insert','organisationRole_validate_update','organisation_location_chain','organisation_location_change_insert','organisation_location_no_delete','organisation_location_no_update','organisation_location_scope_insert','passkey_promotes_anonymous_user'));
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL AND tbl_name IN ('feature','featureLocationHistory','hub','image','layer','location','locationAdoptionProposal','messagingAccount','organisation','passkey','project','property','task','user') AND name NOT IN ('feature_areaId','feature_countryId','feature_districtId','feature_division_coordinate','feature_hamletId','feature_islandId','feature_location_history_feature','feature_location_history_revision','feature_macrohoodId','feature_microhoodId','feature_neighbourhoodId','feature_query_id_idx','feature_query_layer_idx','feature_query_visibility_idx','feature_ruralAreaId','feature_spatial_pending_idx','feature_townId','feature_villageId','hub_code_unique','hub_domain_unique','image_content_hash_idx','layer_historical_source_idx','location_adoption_candidate','location_adoption_project','location_owner_organisation','location_redirect_destination','location_redirect_receipt','location_redirect_review','messaging_account_external','messaging_account_org_platform','organisation_code_unique','passkey_credentialID_idx','passkey_userId_idx','project_code_unique','property_hubId_idx','property_organisationId_idx','property_projectId_idx','property_scope_hubId_key_idx','property_scope_idx','property_scope_organisationId_key_idx','property_scope_projectId_key_idx','user_email_unique','user_telephone_uidx','user_username_nocase_uidx','user_username_unique'));
INSERT INTO __audit_column_order_guard SELECT count(*)=14 FROM pragma_table_info('account');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('breadlineImportFeature');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('breadlineImportIdentity');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('breadlineImportUser');
INSERT INTO __audit_column_order_guard SELECT count(*)=39 FROM pragma_table_info('feature');
INSERT INTO __audit_column_order_guard SELECT count(*)=20 FROM pragma_table_info('featureCountEntry');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('featureDivisionJob');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('featureDivisionMembership');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('featureI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('featureImage');
INSERT INTO __audit_column_order_guard SELECT count(*)=16 FROM pragma_table_info('featureLocation');
INSERT INTO __audit_column_order_guard SELECT count(*)=20 FROM pragma_table_info('featureLocationHistory');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('featureLocationMembership');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('featureMtrJob');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('featureProperty');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('featurePropertyI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('featureSearchDocument');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('featureSpatial');
INSERT INTO __audit_column_order_guard SELECT count(*)=14 FROM pragma_table_info('hub');
INSERT INTO __audit_column_order_guard SELECT count(*)=14 FROM pragma_table_info('hubI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('hubLayer');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('hubProperty');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('hubRole');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('hubUserState');
INSERT INTO __audit_column_order_guard SELECT count(*)=13 FROM pragma_table_info('image');
INSERT INTO __audit_column_order_guard SELECT count(*)=17 FROM pragma_table_info('layer');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('layerI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('layerProperty');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('location');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('locationAccessibility');
INSERT INTO __audit_column_order_guard SELECT count(*)=19 FROM pragma_table_info('locationAddress');
INSERT INTO __audit_column_order_guard SELECT count(*)=17 FROM pragma_table_info('locationAdoptionProposal');
INSERT INTO __audit_column_order_guard SELECT count(*)=11 FROM pragma_table_info('locationIdentityHistory');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('locationIdentityReview');
INSERT INTO __audit_column_order_guard SELECT count(*)=18 FROM pragma_table_info('locationMembership');
INSERT INTO __audit_column_order_guard SELECT count(*)=19 FROM pragma_table_info('locationOccupancy');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('locationRelationshipOperation');
INSERT INTO __audit_column_order_guard SELECT count(*)=16 FROM pragma_table_info('locationRematchJob');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('locationRematchReview');
INSERT INTO __audit_column_order_guard SELECT count(*)=12 FROM pragma_table_info('locationRevision');
INSERT INTO __audit_column_order_guard SELECT count(*)=17 FROM pragma_table_info('locationTransition');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('locationTransitionParticipant');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('mapStyleI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('mapStyles');
INSERT INTO __audit_column_order_guard SELECT count(*)=12 FROM pragma_table_info('messagingAccount');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('messagingConversation');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('messagingMessage');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('messagingPhoneLookup');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('messagingSend');
INSERT INTO __audit_column_order_guard SELECT count(*)=16 FROM pragma_table_info('organisation');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('organisationI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('organisationLocation');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('organisationProperty');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('organisationRole');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('organisationUserPolicy');
INSERT INTO __audit_column_order_guard SELECT count(*)=11 FROM pragma_table_info('passkey');
INSERT INTO __audit_column_order_guard SELECT count(*)=21 FROM pragma_table_info('project');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('projectI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('projectMapStyles');
INSERT INTO __audit_column_order_guard SELECT count(*)=5 FROM pragma_table_info('projectProperty');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('projectRole');
INSERT INTO __audit_column_order_guard SELECT count(*)=21 FROM pragma_table_info('property');
INSERT INTO __audit_column_order_guard SELECT count(*)=6 FROM pragma_table_info('propertyI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('propertyValue');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('propertyValueI18n');
INSERT INTO __audit_column_order_guard SELECT count(*)=8 FROM pragma_table_info('session');
INSERT INTO __audit_column_order_guard SELECT count(*)=15 FROM pragma_table_info('task');
INSERT INTO __audit_column_order_guard SELECT count(*)=2 FROM pragma_table_info('taskImage');
INSERT INTO __audit_column_order_guard SELECT count(*)=17 FROM pragma_table_info('user');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('userActivity');
INSERT INTO __audit_column_order_guard SELECT count(*)=7 FROM pragma_table_info('userFeature');
INSERT INTO __audit_column_order_guard SELECT count(*)=4 FROM pragma_table_info('userLayer');
INSERT INTO __audit_column_order_guard SELECT count(*)=9 FROM pragma_table_info('userMessagingIdentity');
INSERT INTO __audit_column_order_guard SELECT count(*)=3 FROM pragma_table_info('userMessagingIdentityAlias');

-- Stage named columns and rowids before any deletion or parent replacement.
CREATE TABLE "__audit_backup_account" AS SELECT rowid AS __original_rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "account";
CREATE TABLE "__audit_backup_breadlineImportFeature" AS SELECT rowid AS __original_rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "breadlineImportFeature";
CREATE TABLE "__audit_backup_breadlineImportIdentity" AS SELECT rowid AS __original_rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "breadlineImportIdentity";
CREATE TABLE "__audit_backup_breadlineImportUser" AS SELECT rowid AS __original_rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "breadlineImportUser";
CREATE TABLE "__audit_backup_feature" AS SELECT rowid AS __original_rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "feature";
CREATE TABLE "__audit_backup_featureCountEntry" AS SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "featureCountEntry";
CREATE TABLE "__audit_backup_featureDivisionJob" AS SELECT rowid AS __original_rowid,"featureId","generation","attempts","retryAt","lastError" FROM "featureDivisionJob";
CREATE TABLE "__audit_backup_featureDivisionMembership" AS SELECT rowid AS __original_rowid,"featureId","divisionId","selected" FROM "featureDivisionMembership";
CREATE TABLE "__audit_backup_featureI18n" AS SELECT rowid AS __original_rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "featureI18n";
CREATE TABLE "__audit_backup_featureImage" AS SELECT rowid AS __original_rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "featureImage";
CREATE TABLE "__audit_backup_featureLocation" AS SELECT rowid AS __original_rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "featureLocation";
CREATE TABLE "__audit_backup_featureLocationHistory" AS SELECT rowid AS __original_rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "featureLocationHistory";
CREATE TABLE "__audit_backup_featureLocationMembership" AS SELECT rowid AS __original_rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "featureLocationMembership";
CREATE TABLE "__audit_backup_featureMtrJob" AS SELECT rowid AS __original_rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "featureMtrJob";
CREATE TABLE "__audit_backup_featureProperty" AS SELECT rowid AS __original_rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "featureProperty";
CREATE TABLE "__audit_backup_featurePropertyI18n" AS SELECT rowid AS __original_rowid,"featureId","propertyId","locale","value","valueGen" FROM "featurePropertyI18n";
CREATE TABLE "__audit_backup_featureSearchDocument" AS SELECT rowid AS __original_rowid,"id","featureId","locale" FROM "featureSearchDocument";
CREATE TABLE "__audit_backup_featureSpatial" AS SELECT rowid AS __original_rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "featureSpatial";
CREATE TABLE "__audit_backup_hub" AS SELECT rowid AS __original_rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "hub";
CREATE TABLE "__audit_backup_hubI18n" AS SELECT rowid AS __original_rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "hubI18n";
CREATE TABLE "__audit_backup_hubLayer" AS SELECT rowid AS __original_rowid,"hubId","layerId","isDefaultVisible" FROM "hubLayer";
CREATE TABLE "__audit_backup_hubProperty" AS SELECT rowid AS __original_rowid,"hubId","propertyId","rank" FROM "hubProperty";
CREATE TABLE "__audit_backup_hubRole" AS SELECT rowid AS __original_rowid,"hubId","userId","role" FROM "hubRole";
CREATE TABLE "__audit_backup_hubUserState" AS SELECT rowid AS __original_rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "hubUserState";
CREATE TABLE "__audit_backup_image" AS SELECT rowid AS __original_rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "image";
CREATE TABLE "__audit_backup_layer" AS SELECT rowid AS __original_rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "layer";
CREATE TABLE "__audit_backup_layerI18n" AS SELECT rowid AS __original_rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "layerI18n";
CREATE TABLE "__audit_backup_layerProperty" AS SELECT rowid AS __original_rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "layerProperty";
CREATE TABLE "__audit_backup_location" AS SELECT rowid AS __original_rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "location";
CREATE TABLE "__audit_backup_locationAccessibility" AS SELECT rowid AS __original_rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "locationAccessibility";
CREATE TABLE "__audit_backup_locationAddress" AS SELECT rowid AS __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "locationAddress";
CREATE TABLE "__audit_backup_locationAdoptionProposal" AS SELECT rowid AS __original_rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "locationAdoptionProposal";
CREATE TABLE "__audit_backup_locationIdentityHistory" AS SELECT rowid AS __original_rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "locationIdentityHistory";
CREATE TABLE "__audit_backup_locationIdentityReview" AS SELECT rowid AS __original_rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "locationIdentityReview";
CREATE TABLE "__audit_backup_locationMembership" AS SELECT rowid AS __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "locationMembership";
CREATE TABLE "__audit_backup_locationOccupancy" AS SELECT rowid AS __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "locationOccupancy";
CREATE TABLE "__audit_backup_locationRelationshipOperation" AS SELECT rowid AS __original_rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "locationRelationshipOperation";
CREATE TABLE "__audit_backup_locationRematchJob" AS SELECT rowid AS __original_rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "locationRematchJob";
CREATE TABLE "__audit_backup_locationRematchReview" AS SELECT rowid AS __original_rowid,"reviewId","jobId","generation","ssId","evidence" FROM "locationRematchReview";
CREATE TABLE "__audit_backup_locationRevision" AS SELECT rowid AS __original_rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "locationRevision";
CREATE TABLE "__audit_backup_locationTransition" AS SELECT rowid AS __original_rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "locationTransition";
CREATE TABLE "__audit_backup_locationTransitionParticipant" AS SELECT rowid AS __original_rowid,"transitionRevisionId","locationId","side" FROM "locationTransitionParticipant";
CREATE TABLE "__audit_backup_mapStyleI18n" AS SELECT rowid AS __original_rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "mapStyleI18n";
CREATE TABLE "__audit_backup_mapStyles" AS SELECT rowid AS __original_rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "mapStyles";
CREATE TABLE "__audit_backup_messagingAccount" AS SELECT rowid AS __original_rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "messagingAccount";
CREATE TABLE "__audit_backup_messagingConversation" AS SELECT rowid AS __original_rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "messagingConversation";
CREATE TABLE "__audit_backup_messagingMessage" AS SELECT rowid AS __original_rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "messagingMessage";
CREATE TABLE "__audit_backup_messagingPhoneLookup" AS SELECT rowid AS __original_rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "messagingPhoneLookup";
CREATE TABLE "__audit_backup_messagingSend" AS SELECT rowid AS __original_rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "messagingSend";
CREATE TABLE "__audit_backup_organisation" AS SELECT rowid AS __original_rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "organisation";
CREATE TABLE "__audit_backup_organisationI18n" AS SELECT rowid AS __original_rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "organisationI18n";
CREATE TABLE "__audit_backup_organisationLocation" AS SELECT rowid AS __original_rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "organisationLocation";
CREATE TABLE "__audit_backup_organisationProperty" AS SELECT rowid AS __original_rowid,"organisationId","propertyId","rank" FROM "organisationProperty";
CREATE TABLE "__audit_backup_organisationRole" AS SELECT rowid AS __original_rowid,"organisationId","userId","role","grant" FROM "organisationRole";
CREATE TABLE "__audit_backup_organisationUserPolicy" AS SELECT rowid AS __original_rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "organisationUserPolicy";
CREATE TABLE "__audit_backup_passkey" AS SELECT rowid AS __original_rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "passkey";
CREATE TABLE "__audit_backup_project" AS SELECT rowid AS __original_rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "project";
CREATE TABLE "__audit_backup_projectI18n" AS SELECT rowid AS __original_rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "projectI18n";
CREATE TABLE "__audit_backup_projectMapStyles" AS SELECT rowid AS __original_rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "projectMapStyles";
CREATE TABLE "__audit_backup_projectProperty" AS SELECT rowid AS __original_rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "projectProperty";
CREATE TABLE "__audit_backup_projectRole" AS SELECT rowid AS __original_rowid,"projectId","userId","role","capabilities" FROM "projectRole";
CREATE TABLE "__audit_backup_property" AS SELECT rowid AS __original_rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "property";
CREATE TABLE "__audit_backup_propertyI18n" AS SELECT rowid AS __original_rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "propertyI18n";
CREATE TABLE "__audit_backup_propertyValue" AS SELECT rowid AS __original_rowid,"id","propertyId","rank","value" FROM "propertyValue";
CREATE TABLE "__audit_backup_propertyValueI18n" AS SELECT rowid AS __original_rowid,"propertyValueId","locale","value","valueGen" FROM "propertyValueI18n";
CREATE TABLE "__audit_backup_session" AS SELECT rowid AS __original_rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "session";
CREATE TABLE "__audit_backup_task" AS SELECT rowid AS __original_rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "task";
CREATE TABLE "__audit_backup_taskImage" AS SELECT rowid AS __original_rowid,"taskId","imageId" FROM "taskImage";
CREATE TABLE "__audit_backup_user" AS SELECT rowid AS __original_rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "user";
CREATE TABLE "__audit_backup_userActivity" AS SELECT rowid AS __original_rowid,"userId","loginCount","lastLogin" FROM "userActivity";
CREATE TABLE "__audit_backup_userFeature" AS SELECT rowid AS __original_rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "userFeature";
CREATE TABLE "__audit_backup_userLayer" AS SELECT rowid AS __original_rowid,"layerId","userId","hubId","isDefaultVisible" FROM "userLayer";
CREATE TABLE "__audit_backup_userMessagingIdentity" AS SELECT rowid AS __original_rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "userMessagingIdentity";
CREATE TABLE "__audit_backup_userMessagingIdentityAlias" AS SELECT rowid AS __original_rowid,"userId","platform","nativeId" FROM "userMessagingIdentityAlias";
-- AUTOINCREMENT must not reuse IDs from deleted historical rows.
CREATE TABLE __audit_column_order_sequence AS SELECT seq FROM sqlite_sequence WHERE name='featureLocationHistory';

PRAGMA defer_foreign_keys=ON;
-- Suspend trigger side effects, including immutable history and derived search/count writes.
DROP TRIGGER "addressRevision_no_delete";
DROP TRIGGER "addressRevision_no_update";
DROP TRIGGER "address_no_delete";
DROP TRIGGER "address_no_update";
DROP TRIGGER "division_i18n_insert";
DROP TRIGGER "division_i18n_update";
DROP TRIGGER "division_membership_delete";
DROP TRIGGER "division_membership_insert";
DROP TRIGGER "division_membership_update";
DROP TRIGGER "division_translation_delete";
DROP TRIGGER "division_translation_insert";
DROP TRIGGER "division_translation_update";
DROP TRIGGER "feature_count_cache_trim";
DROP TRIGGER "feature_count_entry_delete";
DROP TRIGGER "feature_count_entry_insert";
DROP TRIGGER "feature_count_entry_update";
DROP TRIGGER "feature_count_feature_delete";
DROP TRIGGER "feature_count_feature_insert";
DROP TRIGGER "feature_count_feature_update";
DROP TRIGGER "feature_count_geometry_update";
DROP TRIGGER "feature_count_i18n_delete";
DROP TRIGGER "feature_count_i18n_insert";
DROP TRIGGER "feature_count_i18n_revision_update";
DROP TRIGGER "feature_count_revision_featureProperty_delete";
DROP TRIGGER "feature_count_revision_featureProperty_insert";
DROP TRIGGER "feature_count_revision_featureProperty_update";
DROP TRIGGER "feature_count_revision_hubRole_delete";
DROP TRIGGER "feature_count_revision_hubRole_insert";
DROP TRIGGER "feature_count_revision_hubRole_update";
DROP TRIGGER "feature_count_revision_hub_delete";
DROP TRIGGER "feature_count_revision_hub_insert";
DROP TRIGGER "feature_count_revision_hub_update";
DROP TRIGGER "feature_count_revision_layer_delete";
DROP TRIGGER "feature_count_revision_layer_insert";
DROP TRIGGER "feature_count_revision_layer_update";
DROP TRIGGER "feature_count_revision_organisationRole_delete";
DROP TRIGGER "feature_count_revision_organisationRole_insert";
DROP TRIGGER "feature_count_revision_organisationRole_update";
DROP TRIGGER "feature_count_revision_organisation_delete";
DROP TRIGGER "feature_count_revision_organisation_insert";
DROP TRIGGER "feature_count_revision_organisation_update";
DROP TRIGGER "feature_count_revision_projectRole_delete";
DROP TRIGGER "feature_count_revision_projectRole_insert";
DROP TRIGGER "feature_count_revision_projectRole_update";
DROP TRIGGER "feature_count_revision_project_delete";
DROP TRIGGER "feature_count_revision_project_insert";
DROP TRIGGER "feature_count_revision_project_update";
DROP TRIGGER "feature_count_user_delete";
DROP TRIGGER "feature_count_user_insert";
DROP TRIGGER "feature_count_user_update";
DROP TRIGGER "feature_delete_translations";
DROP TRIGGER "feature_division_create";
DROP TRIGGER "feature_division_move";
DROP TRIGGER "feature_division_projection_move";
DROP TRIGGER "feature_location_clear_detached";
DROP TRIGGER "feature_location_feature_scope";
DROP TRIGGER "feature_location_grouping_insert";
DROP TRIGGER "feature_location_grouping_update";
DROP TRIGGER "feature_location_history_delete";
DROP TRIGGER "feature_location_history_insert";
DROP TRIGGER "feature_location_history_no_delete";
DROP TRIGGER "feature_location_history_no_update";
DROP TRIGGER "feature_location_history_update";
DROP TRIGGER "feature_location_organisation_feature_move";
DROP TRIGGER "feature_location_organisation_insert";
DROP TRIGGER "feature_location_organisation_project_move";
DROP TRIGGER "feature_location_organisation_update";
DROP TRIGGER "feature_location_owner_scope";
DROP TRIGGER "feature_location_placement_insert";
DROP TRIGGER "feature_location_placement_update";
DROP TRIGGER "feature_location_project_scope";
DROP TRIGGER "feature_location_revision_insert";
DROP TRIGGER "feature_location_revision_update";
DROP TRIGGER "feature_location_scope_insert";
DROP TRIGGER "feature_location_scope_update";
DROP TRIGGER "feature_mtr_geometry";
DROP TRIGGER "feature_mtr_insert";
DROP TRIGGER "feature_mtr_walk_limit_insert";
DROP TRIGGER "feature_mtr_walk_limit_update";
DROP TRIGGER "feature_search_document_delete";
DROP TRIGGER "feature_search_i18n_identity_update";
DROP TRIGGER "feature_search_i18n_insert";
DROP TRIGGER "feature_search_i18n_update";
DROP TRIGGER "feature_spatial_insert";
DROP TRIGGER "feature_spatial_update";
DROP TRIGGER "historical_child_route";
DROP TRIGGER "historical_feature_insert";
DROP TRIGGER "historical_feature_update";
DROP TRIGGER "historical_layer_delete";
DROP TRIGGER "historical_layer_lock";
DROP TRIGGER "historical_layer_validate_insert";
DROP TRIGGER "historical_layer_validate_update";
DROP TRIGGER "historical_project_enable";
DROP TRIGGER "historical_project_route";
DROP TRIGGER "historical_source_create";
DROP TRIGGER "historical_source_parent_lock";
DROP TRIGGER "historical_source_restore";
DROP TRIGGER "historical_source_translation";
DROP TRIGGER "locationAddress_chain";
DROP TRIGGER "locationAddress_effectiveFrom_date";
DROP TRIGGER "locationAddress_effectiveTo_date";
DROP TRIGGER "locationAddress_locationId_scope";
DROP TRIGGER "locationAddress_no_delete";
DROP TRIGGER "locationAddress_no_update";
DROP TRIGGER "locationMembership_chain";
DROP TRIGGER "locationMembership_childLocationId_scope";
DROP TRIGGER "locationMembership_cycle";
DROP TRIGGER "locationMembership_effectiveFrom_date";
DROP TRIGGER "locationMembership_effectiveTo_date";
DROP TRIGGER "locationMembership_kinds";
DROP TRIGGER "locationMembership_no_delete";
DROP TRIGGER "locationMembership_no_update";
DROP TRIGGER "locationMembership_parentLocationId_scope";
DROP TRIGGER "locationOccupancy_chain";
DROP TRIGGER "locationOccupancy_containerLocationId_scope";
DROP TRIGGER "locationOccupancy_effectiveFrom_date";
DROP TRIGGER "locationOccupancy_effectiveTo_date";
DROP TRIGGER "locationOccupancy_establishmentLocationId_scope";
DROP TRIGGER "locationOccupancy_kinds";
DROP TRIGGER "locationOccupancy_no_delete";
DROP TRIGGER "locationOccupancy_no_update";
DROP TRIGGER "locationTransitionParticipant_no_delete";
DROP TRIGGER "locationTransitionParticipant_no_update";
DROP TRIGGER "locationTransitionParticipant_scope";
DROP TRIGGER "locationTransition_chain";
DROP TRIGGER "locationTransition_effectiveFrom_date";
DROP TRIGGER "locationTransition_effectiveTo_date";
DROP TRIGGER "locationTransition_no_delete";
DROP TRIGGER "locationTransition_no_update";
DROP TRIGGER "location_accessibility_insert";
DROP TRIGGER "location_accessibility_no_delete";
DROP TRIGGER "location_accessibility_no_update";
DROP TRIGGER "location_adoption_proposal_no_delete";
DROP TRIGGER "location_adoption_proposal_no_update";
DROP TRIGGER "location_canonical_source_only";
DROP TRIGGER "location_identity_history_no_delete";
DROP TRIGGER "location_identity_history_no_update";
DROP TRIGGER "location_identity_history_not_rejected";
DROP TRIGGER "location_identity_merge_valid";
DROP TRIGGER "location_identity_rejection_valid";
DROP TRIGGER "location_identity_review_no_delete";
DROP TRIGGER "location_identity_review_no_update";
DROP TRIGGER "location_linked_shared_insert";
DROP TRIGGER "location_linked_shared_update";
DROP TRIGGER "location_local_change";
DROP TRIGGER "location_redirect_no_delete";
DROP TRIGGER "location_redirect_no_initial";
DROP TRIGGER "location_redirect_no_reactivate";
DROP TRIGGER "location_redirect_state";
DROP TRIGGER "location_redirect_target_immutable";
DROP TRIGGER "location_redirect_valid";
DROP TRIGGER "location_relationship_kind_update";
DROP TRIGGER "location_relationship_operation_immutable_delete";
DROP TRIGGER "location_relationship_operation_immutable_update";
DROP TRIGGER "location_revision_no_delete";
DROP TRIGGER "location_revision_no_update";
DROP TRIGGER "location_revision_snapshot_insert";
DROP TRIGGER "location_revision_unknown_details";
DROP TRIGGER "messaging_identity_verified_insert";
DROP TRIGGER "messaging_identity_verified_update";
DROP TRIGGER "organisationRole_default_grant";
DROP TRIGGER "organisationRole_grant_insert";
DROP TRIGGER "organisationRole_grant_update";
DROP TRIGGER "organisationRole_last_grant";
DROP TRIGGER "organisationRole_legacy_role_update";
DROP TRIGGER "organisationRole_validate_insert";
DROP TRIGGER "organisationRole_validate_update";
DROP TRIGGER "organisation_location_chain";
DROP TRIGGER "organisation_location_change_insert";
DROP TRIGGER "organisation_location_no_delete";
DROP TRIGGER "organisation_location_no_update";
DROP TRIGGER "organisation_location_scope_insert";
DROP TRIGGER "passkey_promotes_anonymous_user";

-- Empty the entire inbound graph while backups retain all original relationships.
DELETE FROM "account";
DELETE FROM "breadlineImportFeature";
DELETE FROM "breadlineImportIdentity";
DELETE FROM "breadlineImportUser";
DELETE FROM "feature";
DELETE FROM "featureCountEntry";
DELETE FROM "featureDivisionJob";
DELETE FROM "featureDivisionMembership";
DELETE FROM "featureI18n";
DELETE FROM "featureImage";
DELETE FROM "featureLocation";
DELETE FROM "featureLocationHistory";
DELETE FROM "featureLocationMembership";
DELETE FROM "featureMtrJob";
DELETE FROM "featureProperty";
DELETE FROM "featurePropertyI18n";
DELETE FROM "featureSearchDocument";
DELETE FROM "featureSpatial";
DELETE FROM "hub";
DELETE FROM "hubI18n";
DELETE FROM "hubLayer";
DELETE FROM "hubProperty";
DELETE FROM "hubRole";
DELETE FROM "hubUserState";
DELETE FROM "image";
DELETE FROM "layer";
DELETE FROM "layerI18n";
DELETE FROM "layerProperty";
DELETE FROM "location";
DELETE FROM "locationAccessibility";
DELETE FROM "locationAddress";
DELETE FROM "locationAdoptionProposal";
DELETE FROM "locationIdentityHistory";
DELETE FROM "locationIdentityReview";
DELETE FROM "locationMembership";
DELETE FROM "locationOccupancy";
DELETE FROM "locationRelationshipOperation";
DELETE FROM "locationRematchJob";
DELETE FROM "locationRematchReview";
DELETE FROM "locationRevision";
DELETE FROM "locationTransition";
DELETE FROM "locationTransitionParticipant";
DELETE FROM "mapStyleI18n";
DELETE FROM "mapStyles";
DELETE FROM "messagingAccount";
DELETE FROM "messagingConversation";
DELETE FROM "messagingMessage";
DELETE FROM "messagingPhoneLookup";
DELETE FROM "messagingSend";
DELETE FROM "organisation";
DELETE FROM "organisationI18n";
DELETE FROM "organisationLocation";
DELETE FROM "organisationProperty";
DELETE FROM "organisationRole";
DELETE FROM "organisationUserPolicy";
DELETE FROM "passkey";
DELETE FROM "project";
DELETE FROM "projectI18n";
DELETE FROM "projectMapStyles";
DELETE FROM "projectProperty";
DELETE FROM "projectRole";
DELETE FROM "property";
DELETE FROM "propertyI18n";
DELETE FROM "propertyValue";
DELETE FROM "propertyValueI18n";
DELETE FROM "session";
DELETE FROM "task";
DELETE FROM "taskImage";
DELETE FROM "user";
DELETE FROM "userActivity";
DELETE FROM "userFeature";
DELETE FROM "userLayer";
DELETE FROM "userMessagingIdentity";
DELETE FROM "userMessagingIdentityAlias";

-- Rebuild only tables whose physical column order differs. Keep existing constraints.
DROP TABLE "feature";
CREATE TABLE "feature" (
  `id` text PRIMARY KEY NOT NULL,
  `organisationId` text NOT NULL,
  `projectId` text NOT NULL,
  `layerId` text NOT NULL,
  `contributorId` text,
  `geometry` text NOT NULL,
  `addressMeta` text DEFAULT '{}',
  `isPublished` integer DEFAULT false NOT NULL,
  `publisherId` text,
  `publishedAt` text,
  `isPendingReview` integer DEFAULT false NOT NULL,
  `isArchived` integer DEFAULT false NOT NULL,
  `isIntangible` integer DEFAULT false NOT NULL,
  `isVisitable` integer DEFAULT true NOT NULL,
  `visitableAsOf` text DEFAULT (CURRENT_DATE),
  `localIsPublished` integer,
  `localIsArchived` integer,
  isDraft integer DEFAULT 0 NOT NULL,
  `spatialIndex` text,
  countryId TEXT REFERENCES divisionDefinition(id),
  areaId TEXT REFERENCES divisionDefinition(id),
  districtId TEXT REFERENCES divisionDefinition(id),
  townId TEXT REFERENCES divisionDefinition(id),
  ruralAreaId TEXT REFERENCES divisionDefinition(id),
  macrohoodId TEXT REFERENCES divisionDefinition(id),
  neighbourhoodId TEXT REFERENCES divisionDefinition(id),
  villageId TEXT REFERENCES divisionDefinition(id),
  microhoodId TEXT REFERENCES divisionDefinition(id),
  hamletId TEXT REFERENCES divisionDefinition(id),
  islandId TEXT REFERENCES divisionDefinition(id),
  divisionResolution TEXT,
  mtrStation TEXT,
  mtrExit TEXT,
  mtrDistance INTEGER CHECK (mtrDistance IS NULL OR mtrDistance >= 0),
  mtrResolution TEXT CHECK (mtrResolution IS NULL OR json_valid(mtrResolution)),
  formWriteToken TEXT,
  localLocationBrands TEXT
  CHECK(localLocationBrands IS NULL OR
    (json_valid(localLocationBrands) AND json_type(localLocationBrands,'$.brands')='array')),
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "featureLocationHistory";
CREATE TABLE featureLocationHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  featureId TEXT NOT NULL,
  version TEXT NOT NULL,
  previousRevision TEXT,
  action TEXT NOT NULL CHECK (action IN ('baseline', 'link', 'update', 'unlink')),
  locationId TEXT NOT NULL,
  factsRevisionId TEXT NOT NULL,
  locationRevisionId TEXT NOT NULL,
  acceptedOverrides TEXT NOT NULL CHECK (json_valid(acceptedOverrides)),
  actorId TEXT,
  factsOrganisationRevision TEXT,
  locationOrganisationRevision TEXT,
  occupancyRevisionId TEXT REFERENCES locationOccupancy(id),
  addressRevisionId TEXT REFERENCES addressRevision(id),
  membershipRevisionIds TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(membershipRevisionIds) AND json_type(membershipRevisionIds)='array'),
  placementOverrides TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(placementOverrides)),
  geometry TEXT,
  policySnapshot TEXT,
  adoptionProposalId TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
DROP TABLE "hub";
CREATE TABLE `hub` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `domain` text,
  `isArchived` integer DEFAULT false NOT NULL,
  `imageId` text REFERENCES image(id),
  `isPublished` integer DEFAULT true NOT NULL,
  `isSubscriptionAvailable` integer DEFAULT false NOT NULL,
  `subscriptionService` text DEFAULT 'substack',
  `subscriptionId` text,
  `subscriptionPlacement` text DEFAULT '{"hubPanel":false,"topBar":false,"menu":true}' NOT NULL,
  `legalContactAddress` text,
  `subscriptionSessionCookie` text,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
DROP TABLE "image";
CREATE TABLE `image` (
  `id` text PRIMARY KEY NOT NULL,
  `contributorId` text,
  `cdn` text DEFAULT 'cloudinary' NOT NULL,
  `env` text DEFAULT 'dg6vtsga1' NOT NULL,
  `cdnId` text,
  `publicId` text NOT NULL,
  `version` integer,
  `isArchived` integer DEFAULT false NOT NULL,
  `localIsArchived` integer,
  `presentationMode` text DEFAULT 'contain' NOT NULL,
  contentHash text,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "layer";
CREATE TABLE "layer" (
  `id` text PRIMARY KEY NOT NULL,
  `organisationId` text NOT NULL,
  `projectId` text NOT NULL,
  `metadata` text,
  `isDefaultVisible` integer DEFAULT false NOT NULL,
  `isPublished` integer DEFAULT false NOT NULL,
  `publishedAt` text,
  `publisherId` text,
  `isArchived` integer DEFAULT false NOT NULL,
  `localIsPublished` integer,
  `localIsArchived` integer,
  "rank" integer DEFAULT 0 NOT NULL,
  relocationPolicy TEXT
  CHECK (relocationPolicy IS NULL OR relocationPolicy IN ('fixed','review','follow')),
  relocationPolicyRevision INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(relocationPolicyRevision) = 'integer' AND relocationPolicyRevision >= 0),
  historicalSourceLayerId TEXT REFERENCES layer(id) ON DELETE RESTRICT,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "location";
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
  kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK(kind IN ('unknown','premises','establishment','building','address','natural')),
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK((state='linked' AND ssId IS NOT NULL) OR
    (state IN ('unresolved','manual') AND ssId IS NULL AND ownerOrganisationId IS NOT NULL) OR
    (state='redirect' AND ssId IS NULL))
);
DROP TABLE "locationAdoptionProposal";
CREATE TABLE "locationAdoptionProposal" (
  id TEXT PRIMARY KEY NOT NULL,
  featureId TEXT NOT NULL,
  projectId TEXT NOT NULL,
  locationId TEXT NOT NULL,
  candidateRevisionId TEXT NOT NULL,
  associationRevision TEXT NOT NULL,
  featureModifiedAt TEXT NOT NULL,
  policyRevision INTEGER NOT NULL CHECK(policyRevision >= 0),
  evidence TEXT NOT NULL CHECK(json_valid(evidence)),
  factsDecision TEXT
  CHECK (factsDecision IS NULL OR (json_valid(factsDecision) AND json_type(factsDecision)='object'
    AND json_extract(factsDecision,'$.proposalId') IS id
    AND json_extract(factsDecision,'$.fieldGroup') IS 'facts'
    AND COALESCE(json_extract(factsDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(factsDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(factsDecision,'$.id') IS 'text' AND json_type(factsDecision,'$.actorId') IS 'text'
    AND json_type(factsDecision,'$.associationRevision') IS 'text' AND json_type(factsDecision,'$.createdAt') IS 'text')),
  locationDecision TEXT
  CHECK (locationDecision IS NULL OR (json_valid(locationDecision) AND json_type(locationDecision)='object'
    AND json_extract(locationDecision,'$.proposalId') IS id
    AND json_extract(locationDecision,'$.fieldGroup') IS 'location'
    AND COALESCE(json_extract(locationDecision,'$.action') IN ('applied','rejected'),0)
    AND COALESCE(length(trim(json_extract(locationDecision,'$.reason'))) BETWEEN 1 AND 2000,0)
    AND json_type(locationDecision,'$.id') IS 'text' AND json_type(locationDecision,'$.actorId') IS 'text'
    AND json_type(locationDecision,'$.associationRevision') IS 'text' AND json_type(locationDecision,'$.createdAt') IS 'text')),
  organisationRevision TEXT NOT NULL DEFAULT '',
  occupancyRevisionId TEXT REFERENCES locationOccupancy(id),
  addressRevisionId TEXT REFERENCES addressRevision(id),
  layerId TEXT,
  layerPolicyRevision INTEGER CHECK(layerPolicyRevision IS NULL OR layerPolicyRevision>=0),
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
DROP TABLE "messagingAccount";
CREATE TABLE messagingAccount (
  id TEXT PRIMARY KEY NOT NULL,
  organisationId TEXT NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('whatsapp','telegram')),
  bridgeAccountId TEXT NOT NULL UNIQUE,
  externalAccountId TEXT,
  displayName TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  inboxCursor INTEGER NOT NULL DEFAULT 0,
  registeredBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  archiveCursor INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
DROP TABLE "organisation";
CREATE TABLE "organisation" (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `url` text,
  `imageId` text,
  `hubId` text,
  `isHubExclusive` integer DEFAULT false NOT NULL,
  `isCoreInclusive` integer DEFAULT true NOT NULL,
  `isPublished` integer DEFAULT true NOT NULL,
  `publishedAt` text,
  `publisherId` text,
  `isArchived` integer DEFAULT false NOT NULL,
  `capabilities` text DEFAULT '{}' NOT NULL,
  defaultLocationVisibility TEXT NOT NULL DEFAULT 'shared' CHECK (defaultLocationVisibility IN ('shared', 'exclusive')),
  settings TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(settings) AND json_type(settings) = 'object'),
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "passkey";
CREATE TABLE "passkey" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "publicKey" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "credentialID" text NOT NULL,
  "counter" integer NOT NULL,
  "deviceType" text NOT NULL,
  "backedUp" integer NOT NULL,
  "transports" text,
  "aaguid" text,
  "createdAt" integer
);
DROP TABLE "project";
CREATE TABLE "project" (
  `id` text PRIMARY KEY NOT NULL,
  `organisationId` text NOT NULL,
  `code` text NOT NULL,
  `imageId` text,
  `isPublished` integer DEFAULT false NOT NULL,
  `publishedAt` text,
  `publisherId` text,
  `isArchived` integer DEFAULT false NOT NULL,
  `localIsPublished` integer,
  `localIsArchived` integer,
  `capabilities` text DEFAULT '{}' NOT NULL,
  "license" TEXT NOT NULL DEFAULT '{"meta":{"allMediaSameRights":true,"attribution":"","isAllRightsReserved":false,"isPublicDomain":false},"media":{"all":{"license":"CC BY-SA / ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false},"image":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"text":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"data":{"license":"ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false}}}',
  useAllInOrgContext integer NOT NULL DEFAULT false,
  cardStyleCode text REFERENCES cardStyle(code),
  markerStyleCode TEXT
  CHECK (markerStyleCode IS NULL OR markerStyleCode IN ('image','dot','pin','flag','breadline')),
  locationPolicy TEXT CHECK(locationPolicy IS NULL OR json_valid(locationPolicy)),
  locationPolicyRevision INTEGER NOT NULL DEFAULT 0 CHECK(locationPolicyRevision>=0),
  flags TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(settings) AND json_type(settings) = 'object'),
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "property";
CREATE TABLE "property" (
  "id" text PRIMARY KEY NOT NULL,
  "projectId" text REFERENCES "project"("id") ON UPDATE cascade ON DELETE cascade,
  "organisationId" text REFERENCES "organisation"("id") ON UPDATE cascade ON DELETE cascade,
  "hubId" text REFERENCES "hub"("id") ON UPDATE cascade ON DELETE cascade,
  "scope" text NOT NULL DEFAULT 'project',
  "type" text NOT NULL DEFAULT 'classifier',
  "key" text NOT NULL,
  "isTranslatable" integer NOT NULL DEFAULT true,
  "component" text NOT NULL DEFAULT 'SelectField',
  "min" integer,
  "max" integer,
  "isUserContributable" integer NOT NULL DEFAULT true,
  "isDefaultEnabled" integer NOT NULL DEFAULT false,
  cardinality TEXT NOT NULL DEFAULT 'one' CHECK(cardinality IN ('one','many')),
  presentation TEXT NOT NULL DEFAULT 'text' CHECK(presentation IN ('text','labelledLinks','numberedReferences')),
  audience TEXT NOT NULL DEFAULT 'public' CHECK(audience IN ('public','internal')),
  dataType TEXT NOT NULL DEFAULT 'text' CHECK(dataType IN ('text','number','date','boolean','link','dateRange','timeRange')),
  dateResolution TEXT NOT NULL DEFAULT 'day' CHECK(dateResolution IN ('decade','year','month','day')),
  timeMaxHour INTEGER NOT NULL DEFAULT 24 CHECK(timeMaxHour IN (24,36)),
  "createdAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  "modifiedAt" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
DROP TABLE "task";
CREATE TABLE "task" (
  `id` text PRIMARY KEY NOT NULL,
  `organisationId` text NOT NULL,
  `projectId` text NOT NULL,
  `featureId` text NOT NULL,
  `contributorId` text NOT NULL,
  `reviewerId` text,
  `type` text NOT NULL,
  `message` text,
  `isReviewed` integer DEFAULT false NOT NULL,
  `reviewOutcome` text,
  `reviewAction` text,
  `reviewReason` text,
  isDraft integer DEFAULT 1 NOT NULL,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null,
  FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
DROP TABLE "user";
CREATE TABLE "user" (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `username` text,
  `displayUsername` text,
  `image` text,
  `attribution` text,
  `email` text,
  `emailVerified` integer DEFAULT false,
  `telephone` text,
  preferredMessagingPlatform TEXT
  CHECK(preferredMessagingPlatform IS NULL OR preferredMessagingPlatform IN ('whatsapp','telegram')),
  `isAnonymous` integer DEFAULT false,
  `isArchived` integer DEFAULT false NOT NULL,
  `locale` text DEFAULT 'en' NOT NULL,
  `preferences` text DEFAULT '{"fallbackLocales":["en","zh-hant"], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}' NOT NULL,
  `experimental` text DEFAULT '{"contributorMode":false, "noLabelsMode":false}' NOT NULL,
  `createdAt` integer NOT NULL,
  `updatedAt` integer NOT NULL
);

-- Restore original values by name, preserving rowids used by external-content FTS.
INSERT INTO "account"(rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt") SELECT __original_rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "__audit_backup_account";
INSERT INTO "breadlineImportFeature"(rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt") SELECT __original_rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "__audit_backup_breadlineImportFeature";
INSERT INTO "breadlineImportIdentity"(rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active") SELECT __original_rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "__audit_backup_breadlineImportIdentity";
INSERT INTO "breadlineImportUser"(rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey") SELECT __original_rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "__audit_backup_breadlineImportUser";
INSERT INTO "feature"(rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands") SELECT __original_rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "__audit_backup_feature";
INSERT INTO "featureCountEntry"("featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId") SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "__audit_backup_featureCountEntry";
INSERT INTO "featureDivisionJob"(rowid,"featureId","generation","attempts","retryAt","lastError") SELECT __original_rowid,"featureId","generation","attempts","retryAt","lastError" FROM "__audit_backup_featureDivisionJob";
INSERT INTO "featureDivisionMembership"(rowid,"featureId","divisionId","selected") SELECT __original_rowid,"featureId","divisionId","selected" FROM "__audit_backup_featureDivisionMembership";
INSERT INTO "featureI18n"(rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties") SELECT __original_rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "__audit_backup_featureI18n";
INSERT INTO "featureImage"(rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished") SELECT __original_rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "__audit_backup_featureImage";
INSERT INTO "featureLocation"(rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId") SELECT __original_rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "__audit_backup_featureLocation";
INSERT INTO "featureLocationHistory"(rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId") SELECT __original_rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "__audit_backup_featureLocationHistory";
INSERT INTO "featureLocationMembership"(rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId") SELECT __original_rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "__audit_backup_featureLocationMembership";
INSERT INTO "featureMtrJob"(rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError") SELECT __original_rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "__audit_backup_featureMtrJob";
INSERT INTO "featureProperty"(rowid,"featureId","propertyId","propertyValueId","value","valueJson") SELECT __original_rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "__audit_backup_featureProperty";
INSERT INTO "featurePropertyI18n"(rowid,"featureId","propertyId","locale","value","valueGen") SELECT __original_rowid,"featureId","propertyId","locale","value","valueGen" FROM "__audit_backup_featurePropertyI18n";
INSERT INTO "featureSearchDocument"(rowid,"id","featureId","locale") SELECT __original_rowid,"id","featureId","locale" FROM "__audit_backup_featureSearchDocument";
INSERT INTO "featureSpatial"(rowid,"featureId","resolution","cell","layerId","longitude","latitude") SELECT __original_rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "__audit_backup_featureSpatial";
INSERT INTO "hub"(rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie") SELECT __original_rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "__audit_backup_hub";
INSERT INTO "hubI18n"(rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen") SELECT __original_rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "__audit_backup_hubI18n";
INSERT INTO "hubLayer"(rowid,"hubId","layerId","isDefaultVisible") SELECT __original_rowid,"hubId","layerId","isDefaultVisible" FROM "__audit_backup_hubLayer";
INSERT INTO "hubProperty"(rowid,"hubId","propertyId","rank") SELECT __original_rowid,"hubId","propertyId","rank" FROM "__audit_backup_hubProperty";
INSERT INTO "hubRole"(rowid,"hubId","userId","role") SELECT __original_rowid,"hubId","userId","role" FROM "__audit_backup_hubRole";
INSERT INTO "hubUserState"(rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt") SELECT __original_rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "__audit_backup_hubUserState";
INSERT INTO "image"(rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash") SELECT __original_rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "__audit_backup_image";
INSERT INTO "layer"(rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId") SELECT __original_rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "__audit_backup_layer";
INSERT INTO "layerI18n"(rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen") SELECT __original_rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_layerI18n";
INSERT INTO "layerProperty"(rowid,"layerId","propertyId","isVisible","isUserContributable") SELECT __original_rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "__audit_backup_layerProperty";
INSERT INTO "location"(rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind") SELECT __original_rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "__audit_backup_location";
INSERT INTO "locationAccessibility"(rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt") SELECT __original_rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "__audit_backup_locationAccessibility";
INSERT INTO "locationAddress"(rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState") SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "__audit_backup_locationAddress";
INSERT INTO "locationAdoptionProposal"(rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision") SELECT __original_rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "__audit_backup_locationAdoptionProposal";
INSERT INTO "locationIdentityHistory"(rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt") SELECT __original_rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "__audit_backup_locationIdentityHistory";
INSERT INTO "locationIdentityReview"(rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt") SELECT __original_rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "__audit_backup_locationIdentityReview";
INSERT INTO "locationMembership"(rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState") SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "__audit_backup_locationMembership";
INSERT INTO "locationOccupancy"(rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState") SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "__audit_backup_locationOccupancy";
INSERT INTO "locationRelationshipOperation"(rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt") SELECT __original_rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "__audit_backup_locationRelationshipOperation";
INSERT INTO "locationRematchJob"(rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt") SELECT __original_rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "__audit_backup_locationRematchJob";
INSERT INTO "locationRematchReview"(rowid,"reviewId","jobId","generation","ssId","evidence") SELECT __original_rowid,"reviewId","jobId","generation","ssId","evidence" FROM "__audit_backup_locationRematchReview";
INSERT INTO "locationRevision"(rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt") SELECT __original_rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "__audit_backup_locationRevision";
INSERT INTO "locationTransition"(rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis") SELECT __original_rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "__audit_backup_locationTransition";
INSERT INTO "locationTransitionParticipant"(rowid,"transitionRevisionId","locationId","side") SELECT __original_rowid,"transitionRevisionId","locationId","side" FROM "__audit_backup_locationTransitionParticipant";
INSERT INTO "mapStyleI18n"(rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen") SELECT __original_rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "__audit_backup_mapStyleI18n";
INSERT INTO "mapStyles"(rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt") SELECT __original_rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "__audit_backup_mapStyles";
INSERT INTO "messagingAccount"(rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor") SELECT __original_rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "__audit_backup_messagingAccount";
INSERT INTO "messagingConversation"(rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt") SELECT __original_rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "__audit_backup_messagingConversation";
INSERT INTO "messagingMessage"(rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload") SELECT __original_rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "__audit_backup_messagingMessage";
INSERT INTO "messagingPhoneLookup"(rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt") SELECT __original_rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "__audit_backup_messagingPhoneLookup";
INSERT INTO "messagingSend"(rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt") SELECT __original_rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "__audit_backup_messagingSend";
INSERT INTO "organisation"(rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings") SELECT __original_rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "__audit_backup_organisation";
INSERT INTO "organisationI18n"(rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen") SELECT __original_rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_organisationI18n";
INSERT INTO "organisationLocation"(rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt") SELECT __original_rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "__audit_backup_organisationLocation";
INSERT INTO "organisationProperty"(rowid,"organisationId","propertyId","rank") SELECT __original_rowid,"organisationId","propertyId","rank" FROM "__audit_backup_organisationProperty";
INSERT INTO "organisationRole"(rowid,"organisationId","userId","role","grant") SELECT __original_rowid,"organisationId","userId","role","grant" FROM "__audit_backup_organisationRole";
INSERT INTO "organisationUserPolicy"(rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision") SELECT __original_rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "__audit_backup_organisationUserPolicy";
INSERT INTO "passkey"(rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid") SELECT __original_rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "__audit_backup_passkey";
INSERT INTO "project"(rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings") SELECT __original_rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "__audit_backup_project";
INSERT INTO "projectI18n"(rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen") SELECT __original_rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_projectI18n";
INSERT INTO "projectMapStyles"(rowid,"projectId","mapStyleId","createdAt","modifiedAt") SELECT __original_rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "__audit_backup_projectMapStyles";
INSERT INTO "projectProperty"(rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled") SELECT __original_rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "__audit_backup_projectProperty";
INSERT INTO "projectRole"(rowid,"projectId","userId","role","capabilities") SELECT __original_rowid,"projectId","userId","role","capabilities" FROM "__audit_backup_projectRole";
INSERT INTO "property"(rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour") SELECT __original_rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "__audit_backup_property";
INSERT INTO "propertyI18n"(rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen") SELECT __original_rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "__audit_backup_propertyI18n";
INSERT INTO "propertyValue"(rowid,"id","propertyId","rank","value") SELECT __original_rowid,"id","propertyId","rank","value" FROM "__audit_backup_propertyValue";
INSERT INTO "propertyValueI18n"(rowid,"propertyValueId","locale","value","valueGen") SELECT __original_rowid,"propertyValueId","locale","value","valueGen" FROM "__audit_backup_propertyValueI18n";
INSERT INTO "session"(rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt") SELECT __original_rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "__audit_backup_session";
INSERT INTO "task"(rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft") SELECT __original_rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "__audit_backup_task";
INSERT INTO "taskImage"(rowid,"taskId","imageId") SELECT __original_rowid,"taskId","imageId" FROM "__audit_backup_taskImage";
INSERT INTO "user"(rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform") SELECT __original_rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "__audit_backup_user";
INSERT INTO "userActivity"(rowid,"userId","loginCount","lastLogin") SELECT __original_rowid,"userId","loginCount","lastLogin" FROM "__audit_backup_userActivity";
INSERT INTO "userFeature"(rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt") SELECT __original_rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "__audit_backup_userFeature";
INSERT INTO "userLayer"(rowid,"layerId","userId","hubId","isDefaultVisible") SELECT __original_rowid,"layerId","userId","hubId","isDefaultVisible" FROM "__audit_backup_userLayer";
INSERT INTO "userMessagingIdentity"(rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt") SELECT __original_rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "__audit_backup_userMessagingIdentity";
INSERT INTO "userMessagingIdentityAlias"(rowid,"userId","platform","nativeId") SELECT __original_rowid,"userId","platform","nativeId" FROM "__audit_backup_userMessagingIdentityAlias";
UPDATE sqlite_sequence SET seq=max(seq,coalesce((SELECT seq FROM __audit_column_order_sequence),0)) WHERE name='featureLocationHistory';

-- Recreate indexes lost with their parent tables before reinstating domain triggers.
CREATE INDEX feature_areaId ON feature(areaId,id);
CREATE INDEX feature_countryId ON feature(countryId,id);
CREATE INDEX feature_districtId ON feature(districtId,id);
CREATE INDEX feature_division_coordinate ON feature(
  json_extract(geometry,'$.coordinates[0]'),
  json_extract(geometry,'$.coordinates[1]')
) WHERE json_extract(geometry,'$.type')='Point';
CREATE INDEX feature_hamletId ON feature(hamletId,id);
CREATE INDEX feature_islandId ON feature(islandId,id);
CREATE INDEX feature_location_history_feature ON featureLocationHistory(featureId, id);
CREATE UNIQUE INDEX feature_location_history_revision ON featureLocationHistory(featureId, version)
  WHERE action != 'unlink';
CREATE INDEX feature_macrohoodId ON feature(macrohoodId,id);
CREATE INDEX feature_microhoodId ON feature(microhoodId,id);
CREATE INDEX feature_neighbourhoodId ON feature(neighbourhoodId,id);
CREATE INDEX feature_query_id_idx ON feature (
  id, isDraft, isPublished, isArchived, layerId, organisationId, projectId,
  isVisitable, isIntangible
);
CREATE INDEX feature_query_layer_idx ON feature (
  layerId, isDraft, isPublished, isArchived, id, organisationId, projectId,
  isVisitable, isIntangible
);
CREATE INDEX feature_query_visibility_idx ON feature (
  isDraft, isPublished, isArchived, layerId, organisationId, projectId, id,
  isVisitable, isIntangible
);
CREATE INDEX feature_ruralAreaId ON feature(ruralAreaId,id);
CREATE INDEX `feature_spatial_pending_idx` ON `feature` (`id`)
  WHERE `spatialIndex` IS NULL AND json_extract(`geometry`, '$.type') = 'Point';
CREATE INDEX feature_townId ON feature(townId,id);
CREATE INDEX feature_villageId ON feature(villageId,id);
CREATE UNIQUE INDEX hub_code_unique ON hub(code);
CREATE UNIQUE INDEX hub_domain_unique ON hub(domain);
CREATE INDEX image_content_hash_idx ON image(contentHash);
CREATE UNIQUE INDEX layer_historical_source_idx ON layer(historicalSourceLayerId)
  WHERE historicalSourceLayerId IS NOT NULL;
CREATE UNIQUE INDEX location_adoption_candidate ON locationAdoptionProposal(featureId,projectId,locationId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,organisationRevision,COALESCE(occupancyRevisionId,''),COALESCE(addressRevisionId,''),COALESCE(layerId,''),COALESCE(layerPolicyRevision,-1),COALESCE(json_extract(evidence,'$.placement'),''));
CREATE INDEX location_adoption_project ON locationAdoptionProposal(projectId,featureId);
CREATE INDEX location_owner_organisation ON location(ownerOrganisationId,id);
CREATE INDEX location_redirect_destination ON location(redirectTargetId) WHERE redirectTargetId IS NOT NULL;
CREATE UNIQUE INDEX location_redirect_receipt ON location(json_extract(redirect,'$.id')) WHERE redirect IS NOT NULL;
CREATE UNIQUE INDEX location_redirect_review ON location(json_extract(redirect,'$.reviewId')) WHERE redirect IS NOT NULL;
CREATE UNIQUE INDEX messaging_account_external ON messagingAccount(platform,externalAccountId);
CREATE UNIQUE INDEX messaging_account_org_platform ON messagingAccount(organisationId,platform);
CREATE UNIQUE INDEX `organisation_code_unique` ON `organisation` (`code`);
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE UNIQUE INDEX `project_code_unique` ON `project` (`code`);
CREATE INDEX "property_hubId_idx" ON "property" ("hubId");
CREATE INDEX "property_organisationId_idx" ON "property" ("organisationId");
CREATE INDEX "property_projectId_idx" ON "property" ("projectId");
CREATE UNIQUE INDEX "property_scope_hubId_key_idx"
ON "property" ("scope", "hubId", "key");
CREATE INDEX "property_scope_idx" ON "property" ("scope");
CREATE UNIQUE INDEX "property_scope_organisationId_key_idx"
ON "property" ("scope", "organisationId", "key");
CREATE UNIQUE INDEX "property_scope_projectId_key_idx"
ON "property" ("scope", "projectId", "key");
CREATE UNIQUE INDEX user_email_unique ON user(email);
CREATE UNIQUE INDEX `user_telephone_uidx` ON `user` (`telephone`);
CREATE UNIQUE INDEX `user_username_nocase_uidx` ON `user` (lower(`username`));
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);
CREATE TRIGGER addressRevision_no_delete BEFORE DELETE ON addressRevision BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER addressRevision_no_update BEFORE UPDATE ON addressRevision BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER address_no_delete BEFORE DELETE ON address BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER address_no_update BEFORE UPDATE ON address BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER division_i18n_insert AFTER INSERT ON divisionDefinition BEGIN
  INSERT INTO divisionI18n SELECT NEW.id,key,json_extract(value,'$.name'),value
  FROM json_each(NEW.attributes,'$.names');
END;
CREATE TRIGGER division_i18n_update AFTER UPDATE OF attributes ON divisionDefinition
WHEN OLD.attributes IS NOT NEW.attributes BEGIN
  DELETE FROM divisionI18n WHERE divisionId=NEW.id;
  INSERT INTO divisionI18n SELECT NEW.id,key,json_extract(value,'$.name'),value
  FROM json_each(NEW.attributes,'$.names');
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_membership_delete AFTER DELETE ON featureDivisionMembership
WHEN OLD.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_membership_insert AFTER INSERT ON featureDivisionMembership
WHEN NEW.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_membership_update AFTER UPDATE ON featureDivisionMembership
WHEN OLD.selected=1 OR NEW.selected=1 BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_translation_delete AFTER DELETE ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_translation_insert AFTER INSERT ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER division_translation_update AFTER UPDATE ON divisionI18n BEGIN
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER `feature_count_cache_trim` AFTER INSERT ON `featureCountCache` BEGIN
  DELETE FROM `featureCountCache` WHERE `key` IN (
    SELECT `key` FROM `featureCountCache` ORDER BY `updatedAt` DESC, `key` DESC LIMIT -1 OFFSET 512
  );
END;
CREATE TRIGGER feature_count_entry_delete AFTER DELETE ON featureCountEntry BEGIN
  DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount=1;
  UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount>1;
END;
CREATE TRIGGER feature_count_entry_insert AFTER INSERT ON featureCountEntry BEGIN
  INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.countryId, NEW.areaId, NEW.districtId, NEW.townId, NEW.ruralAreaId, NEW.macrohoodId, NEW.neighbourhoodId, NEW.villageId, NEW.microhoodId, NEW.hamletId, NEW.islandId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) DO UPDATE SET totalCount=totalCount+1;
END;
CREATE TRIGGER feature_count_entry_update AFTER UPDATE ON featureCountEntry WHEN OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.countryId IS NOT NEW.countryId OR OLD.areaId IS NOT NEW.areaId OR OLD.districtId IS NOT NEW.districtId OR OLD.townId IS NOT NEW.townId OR OLD.ruralAreaId IS NOT NEW.ruralAreaId OR OLD.macrohoodId IS NOT NEW.macrohoodId OR OLD.neighbourhoodId IS NOT NEW.neighbourhoodId OR OLD.villageId IS NOT NEW.villageId OR OLD.microhoodId IS NOT NEW.microhoodId OR OLD.hamletId IS NOT NEW.hamletId OR OLD.islandId IS NOT NEW.islandId BEGIN
  DELETE FROM featureCountRollup WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount=1;
  UPDATE featureCountRollup SET totalCount=totalCount-1 WHERE organisationId=OLD.organisationId AND projectId=OLD.projectId AND layerId=OLD.layerId AND isPublished=OLD.isPublished AND isArchived=OLD.isArchived AND isDraft=OLD.isDraft AND isVisitable=OLD.isVisitable AND isIntangible=OLD.isIntangible AND countryId=OLD.countryId AND areaId=OLD.areaId AND districtId=OLD.districtId AND townId=OLD.townId AND ruralAreaId=OLD.ruralAreaId AND macrohoodId=OLD.macrohoodId AND neighbourhoodId=OLD.neighbourhoodId AND villageId=OLD.villageId AND microhoodId=OLD.microhoodId AND hamletId=OLD.hamletId AND islandId=OLD.islandId AND totalCount>1;
  INSERT INTO featureCountRollup(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId,totalCount) VALUES(NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, NEW.countryId, NEW.areaId, NEW.districtId, NEW.townId, NEW.ruralAreaId, NEW.macrohoodId, NEW.neighbourhoodId, NEW.villageId, NEW.microhoodId, NEW.hamletId, NEW.islandId,1) ON CONFLICT(organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) DO UPDATE SET totalCount=totalCount+1;
END;
CREATE TRIGGER `feature_count_feature_delete` AFTER DELETE ON `feature` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER feature_count_feature_insert AFTER INSERT ON feature BEGIN
  INSERT INTO featureCountEntry(featureId,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId) VALUES(NEW.id,NEW.organisationId, NEW.projectId, NEW.layerId, NEW.isPublished, NEW.isArchived, NEW.isDraft, NEW.isVisitable, NEW.isIntangible, coalesce(NEW.countryId,''), coalesce(NEW.areaId,''), coalesce(NEW.districtId,''), coalesce(NEW.townId,''), coalesce(NEW.ruralAreaId,''), coalesce(NEW.macrohoodId,''), coalesce(NEW.neighbourhoodId,''), coalesce(NEW.villageId,''), coalesce(NEW.microhoodId,''), coalesce(NEW.hamletId,''), coalesce(NEW.islandId,''));
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER feature_count_feature_update AFTER UPDATE OF id,organisationId, projectId, layerId, isPublished, isArchived, isDraft, isVisitable, isIntangible, countryId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId, hamletId, islandId ON feature WHEN OLD.id IS NOT NEW.id OR OLD.organisationId IS NOT NEW.organisationId OR OLD.projectId IS NOT NEW.projectId OR OLD.layerId IS NOT NEW.layerId OR OLD.isPublished IS NOT NEW.isPublished OR OLD.isArchived IS NOT NEW.isArchived OR OLD.isDraft IS NOT NEW.isDraft OR OLD.isVisitable IS NOT NEW.isVisitable OR OLD.isIntangible IS NOT NEW.isIntangible OR OLD.countryId IS NOT NEW.countryId OR OLD.areaId IS NOT NEW.areaId OR OLD.districtId IS NOT NEW.districtId OR OLD.townId IS NOT NEW.townId OR OLD.ruralAreaId IS NOT NEW.ruralAreaId OR OLD.macrohoodId IS NOT NEW.macrohoodId OR OLD.neighbourhoodId IS NOT NEW.neighbourhoodId OR OLD.villageId IS NOT NEW.villageId OR OLD.microhoodId IS NOT NEW.microhoodId OR OLD.hamletId IS NOT NEW.hamletId OR OLD.islandId IS NOT NEW.islandId BEGIN
  UPDATE featureCountEntry SET organisationId=NEW.organisationId, projectId=NEW.projectId, layerId=NEW.layerId, isPublished=NEW.isPublished, isArchived=NEW.isArchived, isDraft=NEW.isDraft, isVisitable=NEW.isVisitable, isIntangible=NEW.isIntangible, countryId=coalesce(NEW.countryId,''), areaId=coalesce(NEW.areaId,''), districtId=coalesce(NEW.districtId,''), townId=coalesce(NEW.townId,''), ruralAreaId=coalesce(NEW.ruralAreaId,''), macrohoodId=coalesce(NEW.macrohoodId,''), neighbourhoodId=coalesce(NEW.neighbourhoodId,''), villageId=coalesce(NEW.villageId,''), microhoodId=coalesce(NEW.microhoodId,''), hamletId=coalesce(NEW.hamletId,''), islandId=coalesce(NEW.islandId,'') WHERE featureId=NEW.id;
  UPDATE featureCountRevision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER `feature_count_geometry_update` AFTER UPDATE OF `geometry`, `spatialIndex` ON `feature`
WHEN OLD.`geometry` IS NOT NEW.`geometry` OR OLD.`spatialIndex` IS NOT NEW.`spatialIndex`
BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER feature_count_i18n_delete AFTER DELETE ON featureI18n BEGIN UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER feature_count_i18n_insert AFTER INSERT ON featureI18n BEGIN UPDATE featureCountRevision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER `feature_count_i18n_revision_update` AFTER UPDATE OF `featureId`, `locale`, `addressProperties`, `title`, `description`, `displayAddress` ON `featureI18n`
WHEN OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`locale` IS NOT NEW.`locale` OR OLD.`addressProperties` IS NOT NEW.`addressProperties` OR OLD.`title` IS NOT NEW.`title` OR OLD.`description` IS NOT NEW.`description` OR OLD.`displayAddress` IS NOT NEW.`displayAddress`
BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_featureProperty_delete` AFTER DELETE ON `featureProperty` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_featureProperty_insert` AFTER INSERT ON `featureProperty` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_featureProperty_update` AFTER UPDATE OF `featureId`, `propertyId`, `propertyValueId`, `value` ON `featureProperty`
WHEN OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`propertyId` IS NOT NEW.`propertyId` OR OLD.`propertyValueId` IS NOT NEW.`propertyValueId` OR OLD.`value` IS NOT NEW.`value` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_delete` AFTER DELETE ON `hubRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_insert` AFTER INSERT ON `hubRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hubRole_update` AFTER UPDATE OF `hubId`, `userId`, `role` ON `hubRole`
WHEN OLD.`hubId` IS NOT NEW.`hubId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_delete` AFTER DELETE ON `hub` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_insert` AFTER INSERT ON `hub` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_hub_update` AFTER UPDATE OF `id`, `code`, `domain` ON `hub`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`domain` IS NOT NEW.`domain` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_delete` AFTER DELETE ON `layer` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_insert` AFTER INSERT ON `layer` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_layer_update` AFTER UPDATE OF `id`, `projectId`, `organisationId`, `isPublished`, `isArchived` ON `layer`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_delete` AFTER DELETE ON `organisationRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_insert` AFTER INSERT ON `organisationRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisationRole_update` AFTER UPDATE OF `organisationId`, `userId`, `role` ON `organisationRole`
WHEN OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_delete` AFTER DELETE ON `organisation` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_insert` AFTER INSERT ON `organisation` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_organisation_update` AFTER UPDATE OF `id`, `code`, `hubId`, `isHubExclusive`, `isCoreInclusive`, `isPublished`, `isArchived` ON `organisation`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`hubId` IS NOT NEW.`hubId` OR OLD.`isHubExclusive` IS NOT NEW.`isHubExclusive` OR OLD.`isCoreInclusive` IS NOT NEW.`isCoreInclusive` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_delete` AFTER DELETE ON `projectRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_insert` AFTER INSERT ON `projectRole` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_projectRole_update` AFTER UPDATE OF `projectId`, `userId`, `role` ON `projectRole`
WHEN OLD.`projectId` IS NOT NEW.`projectId` OR OLD.`userId` IS NOT NEW.`userId` OR OLD.`role` IS NOT NEW.`role` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_delete` AFTER DELETE ON `project` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_insert` AFTER INSERT ON `project` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_revision_project_update` AFTER UPDATE OF `id`, `code`, `organisationId`, `isPublished`, `isArchived` ON `project`
WHEN OLD.`id` IS NOT NEW.`id` OR OLD.`code` IS NOT NEW.`code` OR OLD.`organisationId` IS NOT NEW.`organisationId` OR OLD.`isPublished` IS NOT NEW.`isPublished` OR OLD.`isArchived` IS NOT NEW.`isArchived` BEGIN
  UPDATE `featureCountRevision` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
CREATE TRIGGER `feature_count_user_delete` AFTER DELETE ON `userFeature` BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (OLD.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;
CREATE TRIGGER `feature_count_user_insert` AFTER INSERT ON `userFeature` BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (NEW.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;
CREATE TRIGGER `feature_count_user_update` AFTER UPDATE OF `userId`, `featureId`, `isWishlisted`, `isVisited` ON `userFeature`
WHEN OLD.`userId` IS NOT NEW.`userId` OR OLD.`featureId` IS NOT NEW.`featureId` OR OLD.`isWishlisted` IS NOT NEW.`isWishlisted` OR OLD.`isVisited` IS NOT NEW.`isVisited`
BEGIN
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`) VALUES (OLD.userId, 1)
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
  INSERT INTO `featureCountUserRevision` (`userId`, `revision`)
  SELECT NEW.userId, 1 WHERE NEW.userId IS NOT OLD.userId
  ON CONFLICT (`userId`) DO UPDATE SET `revision` = `revision` + 1;
END;
CREATE TRIGGER feature_delete_translations
AFTER DELETE ON feature
BEGIN
  DELETE FROM featureI18n WHERE featureId = OLD.id;
END;
CREATE TRIGGER feature_division_create AFTER INSERT ON feature BEGIN
  INSERT INTO featureDivisionJob(featureId) VALUES(NEW.id);
END;
CREATE TRIGGER feature_division_move AFTER UPDATE OF geometry ON feature WHEN OLD.geometry IS NOT NEW.geometry BEGIN
  -- Old coordinates must stop contributing immediately, including moves to non-point geometry.
  DELETE FROM featureDivisionMembership WHERE featureId=NEW.id;
  INSERT INTO featureDivisionJob(featureId) VALUES(NEW.id)
  ON CONFLICT(featureId) DO UPDATE SET generation=generation+1,attempts=0,retryAt=0,lastError=NULL;
END;
CREATE TRIGGER feature_division_projection_move AFTER UPDATE OF geometry ON feature
WHEN OLD.geometry IS NOT NEW.geometry BEGIN
  UPDATE feature SET countryId=NULL, areaId=NULL, districtId=NULL, townId=NULL, ruralAreaId=NULL, macrohoodId=NULL, neighbourhoodId=NULL, villageId=NULL, microhoodId=NULL, hamletId=NULL, islandId=NULL, divisionResolution=NULL WHERE id=NEW.id;
END;
CREATE TRIGGER feature_location_clear_detached AFTER INSERT ON featureLocation BEGIN
  UPDATE feature SET localLocationBrands=NULL WHERE id=NEW.featureId AND localLocationBrands IS NOT NULL;
END;
CREATE TRIGGER feature_location_feature_scope BEFORE UPDATE OF projectId, isDraft ON feature
WHEN EXISTS (
  SELECT 1 FROM featureLocation fp JOIN location p ON p.id = fp.locationId
  WHERE fp.featureId = OLD.id AND
    (NEW.isDraft != 0 OR (p.state='manual' AND p.ownerOrganisationId IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId)))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;
CREATE TRIGGER feature_location_grouping_insert AFTER INSERT ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.version,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId),'premises',NEW.version,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId);
 END;
CREATE TRIGGER feature_location_grouping_update AFTER UPDATE ON featureLocation BEGIN
 DELETE FROM featureLocationMembership WHERE featureId=NEW.featureId;
 INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,l.id,l.kind,NEW.version,NEW.occupancyRevisionId,NULL FROM location l
 WHERE l.id=CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END AND l.kind IN ('building','premises');
 INSERT OR IGNORE INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,occupancyRevisionId,membershipRevisionId)
 SELECT NEW.featureId,(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId),'premises',NEW.version,NULL,min(m.id)
 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id GROUP BY (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId);
 END;
CREATE TRIGGER feature_location_history_delete AFTER DELETE ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,version,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry)
 VALUES(OLD.featureId,OLD.version,OLD.locationId,OLD.factsRevisionId,OLD.locationRevisionId,OLD.acceptedOverrides,(SELECT json_extract(localLocationBrands,'$.actorId') FROM feature WHERE id=OLD.featureId AND json_extract(localLocationBrands,'$.sourceAssociationRevision')=OLD.version),OLD.factsOrganisationRevision,OLD.locationOrganisationRevision,OLD.occupancyRevisionId,OLD.addressRevisionId,OLD.membershipRevisionIds,OLD.placementOverrides,OLD.version,'unlink',(SELECT geometry FROM feature WHERE id=OLD.featureId));
 END;
CREATE TRIGGER feature_location_history_insert AFTER INSERT ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,version,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry)
 VALUES(NEW.featureId,NEW.version,NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision,NEW.occupancyRevisionId,NEW.addressRevisionId,NEW.membershipRevisionIds,NEW.placementOverrides,NULL,'link',(SELECT geometry FROM feature WHERE id=NEW.featureId));
 END;
CREATE TRIGGER feature_location_history_no_delete BEFORE DELETE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;
CREATE TRIGGER feature_location_history_no_update BEFORE UPDATE ON featureLocationHistory
BEGIN SELECT RAISE(ABORT, 'Feature Location history is immutable'); END;
CREATE TRIGGER feature_location_history_update AFTER UPDATE ON featureLocation BEGIN
 INSERT INTO featureLocationHistory(featureId,version,locationId,factsRevisionId,locationRevisionId,acceptedOverrides,actorId,factsOrganisationRevision,locationOrganisationRevision,occupancyRevisionId,addressRevisionId,membershipRevisionIds,placementOverrides,previousRevision,action,geometry,policySnapshot,adoptionProposalId)
 VALUES(NEW.featureId,NEW.version,NEW.locationId,NEW.factsRevisionId,NEW.locationRevisionId,NEW.acceptedOverrides,NEW.actorId,NEW.factsOrganisationRevision,NEW.locationOrganisationRevision,NEW.occupancyRevisionId,NEW.addressRevisionId,NEW.membershipRevisionIds,NEW.placementOverrides,OLD.version,'update',NEW.acceptedGeometry,NEW.acceptancePolicy,NEW.acceptanceProposalId);
 END;
CREATE TRIGGER feature_location_organisation_feature_move BEFORE UPDATE OF projectId ON feature
WHEN NEW.projectId IS NOT OLD.projectId AND EXISTS (
 SELECT 1 FROM featureLocation fp WHERE fp.featureId=OLD.id
 AND (fp.factsOrganisationRevision IS NOT NULL OR fp.locationOrganisationRevision IS NOT NULL)
 AND (SELECT organisationId FROM project WHERE id=OLD.projectId) IS NOT (SELECT organisationId FROM project WHERE id=NEW.projectId))
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch: reconcile accepted Organisation corrections before moving the Feature'); END;
CREATE TRIGGER feature_location_organisation_insert BEFORE INSERT ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;
CREATE TRIGGER feature_location_organisation_project_move BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
 SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id WHERE f.projectId=OLD.id
 AND (fp.factsOrganisationRevision IS NOT NULL OR fp.locationOrganisationRevision IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch: reconcile accepted Organisation corrections before moving the Project'); END;
CREATE TRIGGER feature_location_organisation_update BEFORE UPDATE ON featureLocation
WHEN (NEW.factsOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.factsOrganisationRevision))
 OR (NEW.locationOrganisationRevision IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM organisationLocation o JOIN project pr ON pr.organisationId=o.organisationId JOIN feature f ON f.projectId=pr.id
 WHERE f.id=NEW.featureId AND o.locationId=NEW.locationId AND o.id=NEW.locationOrganisationRevision))
BEGIN SELECT RAISE(ABORT,'Organisation Location correction scope mismatch'); END;
CREATE TRIGGER feature_location_owner_scope BEFORE UPDATE OF ownerOrganisationId ON location
WHEN NEW.state='manual' AND NEW.ownerOrganisationId IS NOT NULL AND EXISTS (
  SELECT 1 FROM featureLocation fp JOIN feature f ON f.id = fp.featureId
  WHERE fp.locationId = OLD.id AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT NEW.ownerOrganisationId
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;
CREATE TRIGGER feature_location_placement_insert BEFORE INSERT ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=(SELECT locationId FROM locationCanonical WHERE aliasId=o.containerLocationId) OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND (SELECT locationId FROM locationCanonical WHERE aliasId=o.establishmentLocationId)=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId),(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM reached r JOIN locationMembership m ON (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId)=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;
CREATE TRIGGER feature_location_placement_update BEFORE UPDATE ON featureLocation
WHEN
 (NEW.occupancyRevisionId IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM locationOccupancy o JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location l ON l.id=(SELECT locationId FROM locationCanonical WHERE aliasId=o.containerLocationId) OR o.containerLocationId IS NULL
 WHERE o.id=NEW.occupancyRevisionId AND (SELECT locationId FROM locationCanonical WHERE aliasId=o.establishmentLocationId)=NEW.locationId AND o.assertionState='asserted'
 AND (o.scopeOrganisationId IS NULL OR o.scopeOrganisationId=p.organisationId)
 AND (o.containerLocationId IS NULL OR l.state!='manual' OR l.ownerOrganisationId=p.organisationId)))
 OR EXISTS(SELECT 1 FROM json_each(NEW.membershipRevisionIds) j WHERE NOT EXISTS(
 SELECT 1 FROM locationMembership m JOIN feature f ON f.id=NEW.featureId JOIN project p ON p.id=f.projectId
 JOIN location c ON c.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) JOIN location parent ON parent.id=(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId)
 WHERE m.id=j.value AND m.assertionState='asserted' AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=p.organisationId)
 AND (c.state!='manual' OR c.ownerOrganisationId=p.organisationId) AND (parent.state!='manual' OR parent.ownerOrganisationId=p.organisationId)))
 OR (SELECT count(*) FROM json_each(NEW.membershipRevisionIds))!=(SELECT count(DISTINCT value) FROM json_each(NEW.membershipRevisionIds))
 OR EXISTS(
 WITH RECURSIVE edges(child,parent) AS (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId),(SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id),
 paths(start,finish) AS (SELECT child,parent FROM edges UNION SELECT p.start,e.parent FROM paths p JOIN edges e ON e.child=p.finish)
 SELECT 1 FROM paths WHERE start=finish)
 OR EXISTS(
 WITH RECURSIVE reached(id) AS (
 SELECT CASE WHEN NEW.occupancyRevisionId IS NULL THEN NEW.locationId ELSE (SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=containerLocationId) FROM locationOccupancy WHERE id=NEW.occupancyRevisionId) END
 UNION SELECT (SELECT locationId FROM locationCanonical WHERE aliasId=m.parentLocationId) FROM reached r JOIN locationMembership m ON (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId)=r.id JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id
 ) SELECT 1 FROM locationMembership m JOIN json_each(NEW.membershipRevisionIds) j ON j.value=m.id WHERE (SELECT locationId FROM locationCanonical WHERE aliasId=m.childLocationId) NOT IN (SELECT id FROM reached WHERE id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Accepted placement has unavailable or disconnected references'); END;
CREATE TRIGGER feature_location_project_scope BEFORE UPDATE OF organisationId ON project
WHEN NEW.organisationId IS NOT OLD.organisationId AND EXISTS (
  SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id JOIN location p ON p.id=fp.locationId
  WHERE f.projectId=OLD.id AND p.state='manual' AND p.ownerOrganisationId IS NOT NEW.organisationId)
BEGIN SELECT RAISE(ABORT,'Feature Location scope mismatch'); END;
CREATE TRIGGER feature_location_revision_insert BEFORE INSERT ON featureLocation
WHEN length(NEW.version) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location revision is required'); END;
CREATE TRIGGER feature_location_revision_update BEFORE UPDATE ON featureLocation
WHEN NEW.featureId != OLD.featureId OR NEW.version = OLD.version OR length(NEW.version) = 0
BEGIN SELECT RAISE(ABORT, 'Feature Location update requires a new revision'); END;
CREATE TRIGGER feature_location_scope_insert BEFORE INSERT ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.state!='manual' OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;
CREATE TRIGGER feature_location_scope_update BEFORE UPDATE ON featureLocation
WHEN NOT EXISTS (
  SELECT 1 FROM feature f JOIN location p ON p.id = NEW.locationId
  WHERE f.id = NEW.featureId AND f.isDraft = 0 AND p.state != 'redirect'
    AND (p.state!='manual' OR p.ownerOrganisationId = (SELECT organisationId FROM project WHERE id=f.projectId))
)
BEGIN SELECT RAISE(ABORT, 'Feature Location scope mismatch'); END;
CREATE TRIGGER feature_mtr_geometry AFTER UPDATE OF geometry ON feature
WHEN NEW.geometry IS NOT OLD.geometry BEGIN
  UPDATE feature SET mtrStation=NULL,mtrExit=NULL,mtrDistance=NULL,mtrResolution=NULL WHERE id=NEW.id;
  INSERT INTO featureMtrJob(featureId,geometry) VALUES (NEW.id,NEW.geometry)
  ON CONFLICT(featureId) DO UPDATE SET geometry=excluded.geometry,attempts=0,retryAt=0,leaseUntil=0,lastError=NULL;
END;
CREATE TRIGGER feature_mtr_insert AFTER INSERT ON feature BEGIN
  INSERT INTO featureMtrJob(featureId,geometry) VALUES (NEW.id,NEW.geometry);
END;
CREATE TRIGGER feature_mtr_walk_limit_insert
BEFORE INSERT ON feature WHEN NEW.mtrDistance>1000 BEGIN
  SELECT RAISE(ABORT,'MTR walking distance exceeds 1000 metres');
END;
CREATE TRIGGER feature_mtr_walk_limit_update
BEFORE UPDATE OF mtrDistance ON feature WHEN NEW.mtrDistance>1000 BEGIN
  SELECT RAISE(ABORT,'MTR walking distance exceeds 1000 metres');
END;
CREATE TRIGGER feature_search_document_delete AFTER DELETE ON featureSearchDocument BEGIN
  DELETE FROM featureSearchFts WHERE rowid = OLD.id;
END;
CREATE TRIGGER feature_search_i18n_identity_update
AFTER UPDATE OF featureId, locale ON featureI18n
WHEN (NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale)
  AND EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId)
  AND NOT EXISTS (
    SELECT 1 FROM featureSearchDocument WHERE featureId = NEW.featureId AND locale = NEW.locale
  ) BEGIN
  INSERT INTO featureSearchDocument(featureId, locale) VALUES(NEW.featureId, NEW.locale);
  INSERT INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;
CREATE TRIGGER feature_search_i18n_insert AFTER INSERT ON featureI18n
WHEN EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId) BEGIN
  INSERT INTO featureSearchDocument(featureId, locale) VALUES(NEW.featureId, NEW.locale)
  ON CONFLICT(featureId, locale) DO NOTHING;
  INSERT OR REPLACE INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;
CREATE TRIGGER feature_search_i18n_update
AFTER UPDATE OF title, description, displayAddress ON featureI18n
WHEN NEW.title IS NOT OLD.title OR NEW.description IS NOT OLD.description
  OR NEW.displayAddress IS NOT OLD.displayAddress BEGIN
  INSERT OR REPLACE INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;
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
CREATE TRIGGER `feature_spatial_update` AFTER UPDATE OF `geometry`, `spatialIndex`, `layerId` ON `feature`
BEGIN
  DELETE FROM `featureSpatial` WHERE `featureId` = NEW.id;
  INSERT INTO `featureSpatial` (`featureId`, `resolution`, `cell`, `layerId`, `longitude`, `latitude`)
  SELECT NEW.id, CAST(cells.key AS integer), cells.value, NEW.layerId,
    json_extract(NEW.spatialIndex, '$.longitude'), json_extract(NEW.spatialIndex, '$.latitude')
  FROM json_each(NEW.spatialIndex, '$.cells') AS cells
  WHERE NEW.spatialIndex IS NOT NULL
    AND json(json_extract(NEW.spatialIndex, '$.geometry')) = json(NEW.geometry)
    AND json_extract(NEW.geometry, '$.type') = 'Point';
  -- Legacy/manual geometry edits become pending repairs instead of stale map hits.
  UPDATE `feature` SET `spatialIndex` = NULL
  WHERE `id` = NEW.id AND NEW.spatialIndex IS NOT NULL
    AND json(json_extract(NEW.spatialIndex, '$.geometry')) IS NOT json(NEW.geometry);
END;
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
CREATE TRIGGER historical_layer_delete BEFORE DELETE ON layer
WHEN OLD.historicalSourceLayerId IS NOT NULL BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_LAYER_MANAGED');
END;
CREATE TRIGGER historical_layer_lock BEFORE UPDATE OF historicalSourceLayerId,projectId,organisationId ON layer
WHEN OLD.historicalSourceLayerId IS NOT NULL AND
 (NEW.historicalSourceLayerId IS NOT OLD.historicalSourceLayerId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.organisationId IS NOT OLD.organisationId) BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_LAYER_PARENT_LOCKED');
END;
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
CREATE TRIGGER historical_project_enable AFTER UPDATE OF flags ON project
WHEN json_extract(NEW.flags,'$.showHistoricalLayers')=1 BEGIN
  INSERT INTO layer(id,organisationId,projectId,historicalSourceLayerId,metadata,rank,isDefaultVisible,isPublished,isArchived)
    SELECT 'history:'||s.id,s.organisationId,s.projectId,s.id,s.metadata,s.rank+1,
      s.isDefaultVisible,s.isPublished,s.isArchived FROM layer s
    WHERE s.projectId=NEW.id AND s.historicalSourceLayerId IS NULL AND s.isArchived=0
      AND NOT EXISTS(SELECT 1 FROM layer h WHERE h.historicalSourceLayerId=s.id);

END;
CREATE TRIGGER historical_project_route AFTER UPDATE OF flags ON project
WHEN coalesce(json_extract(NEW.flags,'$.showHistoricalLayers'),0) != coalesce(json_extract(OLD.flags,'$.showHistoricalLayers'),0) BEGIN
  UPDATE feature SET layerId=layerId,modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE projectId=NEW.id AND isIntangible=1;
END;
CREATE TRIGGER historical_source_create AFTER INSERT ON layer
WHEN NEW.historicalSourceLayerId IS NULL AND
  (SELECT json_extract(flags,'$.showHistoricalLayers') FROM project WHERE id=NEW.projectId)=1 BEGIN
  INSERT INTO layer(id,organisationId,projectId,historicalSourceLayerId,metadata,rank,isDefaultVisible,isPublished,isArchived)
    VALUES('history:'||NEW.id,NEW.organisationId,NEW.projectId,NEW.id,NEW.metadata,NEW.rank+1,
      NEW.isDefaultVisible,NEW.isPublished,NEW.isArchived);
END;
CREATE TRIGGER historical_source_parent_lock BEFORE UPDATE OF projectId,organisationId ON layer
WHEN (NEW.projectId IS NOT OLD.projectId OR NEW.organisationId IS NOT OLD.organisationId)
 AND EXISTS(SELECT 1 FROM layer WHERE historicalSourceLayerId=OLD.id) BEGIN
  SELECT RAISE(ABORT,'HISTORICAL_SOURCE_PARENT_LOCKED');
END;
CREATE TRIGGER historical_source_restore AFTER UPDATE OF isArchived ON layer
WHEN OLD.isArchived=1 AND NEW.isArchived=0 AND NEW.historicalSourceLayerId IS NULL
BEGIN UPDATE project SET flags=flags WHERE id=NEW.projectId AND json_extract(flags,'$.showHistoricalLayers')=1; END;
CREATE TRIGGER historical_source_translation AFTER INSERT ON layerI18n BEGIN
  INSERT OR IGNORE INTO layerI18n(layerId,locale,name,nameShort,nameGen,nameShortGen)
    SELECT id,NEW.locale,substr(NEW.name,1,110)||CASE NEW.locale WHEN 'en' THEN ' — Historic' ELSE ' — 歷史' END,
      CASE NEW.locale WHEN 'en' THEN 'Historic' WHEN 'zh-hans' THEN '历史' ELSE '歷史' END,0,0
    FROM layer WHERE historicalSourceLayerId=NEW.layerId;
END;
CREATE TRIGGER locationAddress_chain BEFORE INSERT ON locationAddress
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationAddress p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationAddress p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;
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
CREATE TRIGGER locationAddress_locationId_scope BEFORE INSERT ON locationAddress
WHEN NEW.locationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.locationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;
CREATE TRIGGER locationAddress_no_delete BEFORE DELETE ON locationAddress BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationAddress_no_update BEFORE UPDATE ON locationAddress BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationMembership_chain BEFORE INSERT ON locationMembership
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationMembership p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationMembership p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;
CREATE TRIGGER locationMembership_childLocationId_scope BEFORE INSERT ON locationMembership
WHEN NEW.childLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.childLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;
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
CREATE TRIGGER locationMembership_kinds BEFORE INSERT ON locationMembership
WHEN (SELECT kind FROM location WHERE id=NEW.childLocationId) NOT IN ('building','premises')
 OR (SELECT kind FROM location WHERE id=NEW.parentLocationId)!='premises'
BEGIN SELECT RAISE(ABORT,'Membership requires a building or premises within premises'); END;
CREATE TRIGGER locationMembership_no_delete BEFORE DELETE ON locationMembership BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationMembership_no_update BEFORE UPDATE ON locationMembership BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationMembership_parentLocationId_scope BEFORE INSERT ON locationMembership
WHEN NEW.parentLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.parentLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;
CREATE TRIGGER locationOccupancy_chain BEFORE INSERT ON locationOccupancy
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationOccupancy p WHERE p.id=NEW.previousRevisionId AND p.relationshipId=NEW.relationshipId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.relationshipId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationOccupancy p WHERE p.relationshipId=NEW.relationshipId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;
CREATE TRIGGER locationOccupancy_containerLocationId_scope BEFORE INSERT ON locationOccupancy
WHEN NEW.containerLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.containerLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;
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
CREATE TRIGGER locationOccupancy_establishmentLocationId_scope BEFORE INSERT ON locationOccupancy
WHEN NEW.establishmentLocationId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM location l WHERE l.id=NEW.establishmentLocationId AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId IS NEW.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Relationship endpoint unavailable in scope'); END;
CREATE TRIGGER locationOccupancy_kinds BEFORE INSERT ON locationOccupancy
WHEN (SELECT kind FROM location WHERE id=NEW.establishmentLocationId)!='establishment'
 OR (NEW.containerLocationId IS NOT NULL AND (SELECT kind FROM location WHERE id=NEW.containerLocationId) NOT IN ('building','premises'))
BEGIN SELECT RAISE(ABORT,'Occupancy requires an establishment and building or premises'); END;
CREATE TRIGGER locationOccupancy_no_delete BEFORE DELETE ON locationOccupancy BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationOccupancy_no_update BEFORE UPDATE ON locationOccupancy BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationTransitionParticipant_no_delete BEFORE DELETE ON locationTransitionParticipant BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationTransitionParticipant_no_update BEFORE UPDATE ON locationTransitionParticipant BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationTransitionParticipant_scope BEFORE INSERT ON locationTransitionParticipant
WHEN NOT EXISTS(SELECT 1 FROM location l JOIN locationTransition t ON t.id=NEW.transitionRevisionId WHERE l.id=NEW.locationId AND (l.state!='manual' OR l.ownerOrganisationId IS t.scopeOrganisationId))
BEGIN SELECT RAISE(ABORT,'Transition participant unavailable in scope'); END;
CREATE TRIGGER locationTransition_chain BEFORE INSERT ON locationTransition
WHEN (NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationTransition p WHERE p.id=NEW.previousRevisionId AND p.transitionId=NEW.transitionId AND p.scopeOrganisationId IS NEW.scopeOrganisationId))
 OR (NEW.previousRevisionId IS NULL AND NEW.transitionId!=NEW.id AND NOT EXISTS(SELECT 1 FROM locationTransition p WHERE p.transitionId=NEW.transitionId))
BEGIN SELECT RAISE(ABORT,'Relationship predecessor or root mismatch'); END;
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
CREATE TRIGGER locationTransition_no_delete BEFORE DELETE ON locationTransition BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER locationTransition_no_update BEFORE UPDATE ON locationTransition BEGIN SELECT RAISE(ABORT,'Lifecycle assertions are immutable'); END;
CREATE TRIGGER location_accessibility_insert BEFORE INSERT ON locationAccessibility BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM location l JOIN locationRevision v ON v.locationId=l.id
  WHERE l.id=NEW.locationId AND l.state IN ('linked','unresolved') AND l.kind IN ('establishment','building','premises')
  AND v.id=NEW.locationRevisionId) THEN RAISE(ABORT,'Accessibility requires a shared live Location') END;
 SELECT CASE WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locationAccessibility p
  WHERE p.id=NEW.previousRevisionId AND p.locationId=NEW.locationId)
  THEN RAISE(ABORT,'Accessibility predecessor belongs to another Location') END;
END;
CREATE TRIGGER location_accessibility_no_delete BEFORE DELETE ON locationAccessibility BEGIN
 SELECT RAISE(ABORT,'Accessibility history is immutable');
END;
CREATE TRIGGER location_accessibility_no_update BEFORE UPDATE ON locationAccessibility BEGIN
 SELECT RAISE(ABORT,'Accessibility history is immutable');
END;
CREATE TRIGGER location_adoption_proposal_no_delete BEFORE DELETE ON locationAdoptionProposal BEGIN SELECT RAISE(ABORT,'Location adoption evidence is immutable'); END;
CREATE TRIGGER location_adoption_proposal_no_update BEFORE UPDATE ON locationAdoptionProposal
WHEN NEW.occupancyRevisionId IS NOT OLD.occupancyRevisionId OR NEW.addressRevisionId IS NOT OLD.addressRevisionId OR NEW.layerId IS NOT OLD.layerId OR NEW.layerPolicyRevision IS NOT OLD.layerPolicyRevision OR NEW.organisationRevision IS NOT OLD.organisationRevision OR NEW.id IS NOT OLD.id OR NEW.featureId IS NOT OLD.featureId OR NEW.projectId IS NOT OLD.projectId
  OR NEW.locationId IS NOT OLD.locationId OR NEW.candidateRevisionId IS NOT OLD.candidateRevisionId
  OR NEW.associationRevision IS NOT OLD.associationRevision OR NEW.featureModifiedAt IS NOT OLD.featureModifiedAt
  OR NEW.policyRevision IS NOT OLD.policyRevision OR NEW.evidence IS NOT OLD.evidence OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.factsDecision IS NOT NULL AND NEW.factsDecision IS NOT OLD.factsDecision)
  OR (OLD.locationDecision IS NOT NULL AND NEW.locationDecision IS NOT OLD.locationDecision)
BEGIN SELECT RAISE(ABORT,'Location adoption evidence and decisions are immutable'); END;
CREATE TRIGGER location_canonical_source_only BEFORE INSERT ON locationRevision
 WHEN NEW.origin!='saanseoi' AND EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state='linked')
 BEGIN SELECT RAISE(ABORT,'Canonical Location baselines are source-controlled'); END;
CREATE TRIGGER location_identity_history_no_delete BEFORE DELETE ON locationIdentityHistory
BEGIN SELECT RAISE(ABORT,'Location identity history is immutable'); END;
CREATE TRIGGER location_identity_history_no_update BEFORE UPDATE ON locationIdentityHistory
BEGIN SELECT RAISE(ABORT,'Location identity history is immutable'); END;
CREATE TRIGGER location_identity_history_not_rejected BEFORE INSERT ON locationIdentityHistory
WHEN EXISTS(SELECT 1 FROM locationIdentityReview WHERE id=NEW.reviewId AND rejection IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Location identity review was rejected'); END;
CREATE TRIGGER location_identity_merge_valid BEFORE UPDATE OF mergeReviews ON locationIdentityReview
WHEN (NEW.rejection IS NOT NULL AND NEW.mergeReviews IS NOT OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(NEW.mergeReviews) m WHERE
  json_extract(m.value,'$.identityReviewId') IS NOT NEW.id
  OR json_extract(m.value,'$.targetLocationId') IS NOT NEW.locationId
  OR json_extract(m.value,'$.sourceLocationId') IS NEW.locationId
  OR NOT EXISTS(SELECT 1 FROM locationRevision pr WHERE pr.locationId=json_extract(m.value,'$.sourceLocationId')
    AND pr.id=json_extract(m.value,'$.sourceRevisionId')))
BEGIN SELECT RAISE(ABORT,'Invalid Location merge evidence'); END;
CREATE TRIGGER location_identity_rejection_valid BEFORE UPDATE OF rejection ON locationIdentityReview
WHEN NEW.rejection IS NOT NULL AND (EXISTS(SELECT 1 FROM locationIdentityHistory WHERE reviewId=NEW.id)
  OR EXISTS(SELECT 1 FROM location p,json_each(NEW.mergeReviews) m
    WHERE json_extract(p.redirect,'$.reviewId')=json_extract(m.value,'$.id')))
BEGIN SELECT RAISE(ABORT,'Location identity review cannot be rejected'); END;
CREATE TRIGGER location_identity_review_no_delete BEFORE DELETE ON locationIdentityReview
BEGIN SELECT RAISE(ABORT,'Location identity review is immutable'); END;
CREATE TRIGGER location_identity_review_no_update BEFORE UPDATE ON locationIdentityReview
WHEN NEW.id IS NOT OLD.id OR NEW.locationId IS NOT OLD.locationId OR NEW.ownerOrganisationId IS NOT OLD.ownerOrganisationId
  OR NEW.baseline IS NOT OLD.baseline OR NEW.projection IS NOT OLD.projection
  OR NEW.actorId IS NOT OLD.actorId OR NEW.createdAt IS NOT OLD.createdAt
  OR (OLD.rejection IS NOT NULL AND NEW.rejection IS NOT OLD.rejection)
  OR json_array_length(NEW.mergeReviews)<json_array_length(OLD.mergeReviews)
  OR EXISTS(SELECT 1 FROM json_each(OLD.mergeReviews) old
    WHERE json_extract(NEW.mergeReviews,'$['||old.key||']') IS NOT old.value)
BEGIN SELECT RAISE(ABORT,'Location identity evidence and decisions are immutable'); END;
CREATE TRIGGER location_linked_shared_insert BEFORE INSERT ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;
CREATE TRIGGER location_linked_shared_update BEFORE UPDATE ON location
 WHEN NEW.state='linked' AND NEW.ownerOrganisationId IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'Source-linked Locations must be shared'); END;
CREATE TRIGGER location_local_change AFTER INSERT ON locationRevision
 WHEN NEW.origin='local' AND NEW.version>1
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,revisionId,status,origin,actorId)
 SELECT 'local:'||NEW.id,NEW.locationId,NULL,NEW.id,'pending','local',json_extract(NEW.rawSource,'$.actorId'); END;
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
CREATE TRIGGER location_relationship_kind_update BEFORE UPDATE OF kind ON location
WHEN NEW.kind!=OLD.kind AND (
 (NEW.kind!='establishment' AND EXISTS(SELECT 1 FROM locationOccupancyHead WHERE establishmentLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current'))
 OR (NEW.kind NOT IN ('building','premises') AND (EXISTS(SELECT 1 FROM locationOccupancyHead WHERE containerLocationId=NEW.id AND assertionState='asserted' AND occupancyState='current') OR EXISTS(SELECT 1 FROM locationMembershipHead WHERE childLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
 OR (NEW.kind!='premises' AND EXISTS(SELECT 1 FROM locationMembershipHead WHERE parentLocationId=NEW.id AND assertionState='asserted' AND membershipState='current')))
BEGIN SELECT RAISE(ABORT,'Reconcile current relationships before changing Location kind'); END;
CREATE TRIGGER location_relationship_operation_immutable_delete BEFORE DELETE ON locationRelationshipOperation BEGIN SELECT RAISE(ABORT,'Relationship operation receipts are immutable'); END;
CREATE TRIGGER location_relationship_operation_immutable_update BEFORE UPDATE ON locationRelationshipOperation BEGIN SELECT RAISE(ABORT,'Relationship operation receipts are immutable'); END;
CREATE TRIGGER location_revision_no_delete BEFORE DELETE ON locationRevision
BEGIN SELECT RAISE(ABORT, 'Location revisions are immutable'); END;
CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision
BEGIN SELECT RAISE(ABORT,'Location revisions are immutable'); END;
CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.schemaVersion') IS NOT 1
 OR COALESCE(json_extract(NEW.facts,'$.kind') IN ('unknown','premises','establishment','building','natural','address'),0)=0
 OR json_type(NEW.facts,'$.common') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.names') IS NOT 'object'
 OR json_type(NEW.facts,'$.common.location') IS NOT 'object'
 OR json_type(NEW.facts,'$.details') IS NOT 'object'
 OR (json_extract(NEW.facts,'$.kind')='establishment' AND json_type(NEW.facts,'$.details.brands') IS NOT 'array')
BEGIN SELECT RAISE(ABORT,'Location revisions require a versioned typed facts snapshot'); END;
CREATE TRIGGER location_revision_unknown_details BEFORE INSERT ON locationRevision
WHEN json_extract(NEW.facts,'$.kind')='unknown' AND EXISTS(SELECT 1 FROM json_each(NEW.facts,'$.details'))
BEGIN SELECT RAISE(ABORT,'Unknown Location facts cannot contain kind-specific details'); END;
CREATE TRIGGER messaging_identity_verified_insert
AFTER INSERT ON userMessagingIdentity WHEN NEW.verifiedAt IS NOT NULL
BEGIN
  INSERT INTO userMessagingIdentityAlias(userId,platform,nativeId)
  VALUES(NEW.userId,NEW.platform,NEW.nativeId);
END;
CREATE TRIGGER messaging_identity_verified_update
AFTER UPDATE OF nativeId,verifiedAt ON userMessagingIdentity
BEGIN
  DELETE FROM userMessagingIdentityAlias
  WHERE userId = NEW.userId AND platform = NEW.platform
    AND (NEW.verifiedAt IS NULL OR OLD.nativeId IS NOT NEW.nativeId OR OLD.verifiedAt IS NOT NEW.verifiedAt);
  INSERT INTO userMessagingIdentityAlias(userId,platform,nativeId)
  SELECT NEW.userId,NEW.platform,NEW.nativeId
  WHERE NEW.verifiedAt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM userMessagingIdentityAlias
    WHERE userId = NEW.userId AND platform = NEW.platform AND nativeId = NEW.nativeId
  );
END;
CREATE TRIGGER organisationRole_default_grant AFTER INSERT ON organisationRole
WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.grant))
BEGIN UPDATE organisationRole SET grant=json_object('manual',NEW.role) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
CREATE TRIGGER organisationRole_grant_insert AFTER INSERT ON organisationRole
WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant)) AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET role=(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
CREATE TRIGGER organisationRole_grant_update AFTER UPDATE OF grant ON organisationRole
WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant)) AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET role=(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
CREATE TRIGGER organisationRole_last_grant AFTER UPDATE OF grant ON organisationRole
WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.grant))
BEGIN DELETE FROM organisationRole WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
CREATE TRIGGER organisationRole_legacy_role_update AFTER UPDATE OF role ON organisationRole
WHEN NEW.grant=OLD.grant AND NEW.role<>OLD.role AND NEW.role<>(CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='owner') THEN 'owner' WHEN EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE value='member') THEN 'member' ELSE 'user' END)
BEGIN UPDATE organisationRole SET grant=json_set(grant,'$.manual',NEW.role) WHERE organisationId=NEW.organisationId AND userId=NEW.userId; END;
CREATE TRIGGER organisationRole_validate_insert BEFORE INSERT ON organisationRole
WHEN NEW.role NOT IN ('user','member','owner') OR EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE type<>'text' OR value NOT IN ('user','member','owner') OR key='')
BEGIN SELECT RAISE(ABORT,'invalid organisation role grant'); END;
CREATE TRIGGER organisationRole_validate_update BEFORE UPDATE OF role,grant ON organisationRole
WHEN NEW.role NOT IN ('user','member','owner') OR EXISTS(SELECT 1 FROM json_each(NEW.grant) WHERE type<>'text' OR value NOT IN ('user','member','owner') OR key='')
BEGIN SELECT RAISE(ABORT,'invalid organisation role grant'); END;
CREATE TRIGGER organisation_location_chain BEFORE INSERT ON organisationLocation
 WHEN NEW.previousRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organisationLocation p WHERE p.id=NEW.previousRevisionId AND p.organisationId=NEW.organisationId AND p.locationId=NEW.locationId)
 BEGIN SELECT RAISE(ABORT,'Organisation correction predecessor scope mismatch'); END;
CREATE TRIGGER organisation_location_change_insert AFTER INSERT ON organisationLocation
 BEGIN INSERT INTO locationRefreshItem(runId,locationId,ssId,status,origin,organisationId,organisationRevision,actorId)
 VALUES('local:'||NEW.id,NEW.locationId,NULL,'pending','local',NEW.organisationId,NEW.id,NEW.actorId); END;
CREATE TRIGGER organisation_location_no_delete BEFORE DELETE ON organisationLocation
 BEGIN SELECT RAISE(ABORT,'Organisation corrections are retained'); END;
CREATE TRIGGER organisation_location_no_update BEFORE UPDATE ON organisationLocation
 BEGIN SELECT RAISE(ABORT,'Organisation corrections are immutable'); END;
CREATE TRIGGER organisation_location_scope_insert BEFORE INSERT ON organisationLocation
 WHEN NOT EXISTS(SELECT 1 FROM location WHERE id=NEW.locationId AND state!='redirect' AND (state!='manual' OR ownerOrganisationId=NEW.organisationId))
 BEGIN SELECT RAISE(ABORT,'Organisation Location scope mismatch'); END;
CREATE TRIGGER "passkey_promotes_anonymous_user"
AFTER INSERT ON "passkey"
FOR EACH ROW
WHEN (
  SELECT "isAnonymous"
  FROM "user"
  WHERE "id" = NEW."userId"
) = 1
BEGIN
  UPDATE "user"
  SET "isAnonymous" = 0,
      "updatedAt" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE "id" = NEW."userId";
END;

-- Prove both directions of every staged rowset before dropping rollback material.
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "account" EXCEPT SELECT __original_rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "__audit_backup_account") AND NOT EXISTS(SELECT __original_rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "__audit_backup_account" EXCEPT SELECT rowid,"id","userId","accountId","issuer","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt" FROM "account");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "breadlineImportFeature" EXCEPT SELECT __original_rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "__audit_backup_breadlineImportFeature") AND NOT EXISTS(SELECT __original_rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "__audit_backup_breadlineImportFeature" EXCEPT SELECT rowid,"sourceTable","sourceId","featureId","sourceHash","importedAt" FROM "breadlineImportFeature");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "breadlineImportIdentity" EXCEPT SELECT __original_rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "__audit_backup_breadlineImportIdentity") AND NOT EXISTS(SELECT __original_rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "__audit_backup_breadlineImportIdentity" EXCEPT SELECT rowid,"sourceUserId","sourceVolunteerId","userId","email","name","sourceUid","active" FROM "breadlineImportIdentity");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "breadlineImportUser" EXCEPT SELECT __original_rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "__audit_backup_breadlineImportUser") AND NOT EXISTS(SELECT __original_rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "__audit_backup_breadlineImportUser" EXCEPT SELECT rowid,"userId","telephone","state","claimedEmail","claimedAt","claimKey" FROM "breadlineImportUser");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "feature" EXCEPT SELECT __original_rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "__audit_backup_feature") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "__audit_backup_feature" EXCEPT SELECT rowid,"id","organisationId","projectId","layerId","contributorId","geometry","addressMeta","isPublished","publisherId","publishedAt","isPendingReview","isArchived","isIntangible","isVisitable","visitableAsOf","createdAt","modifiedAt","localIsPublished","localIsArchived","isDraft","spatialIndex","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId","divisionResolution","mtrStation","mtrExit","mtrDistance","mtrResolution","formWriteToken","localLocationBrands" FROM "feature");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "featureCountEntry" EXCEPT SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "__audit_backup_featureCountEntry") AND NOT EXISTS(SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "__audit_backup_featureCountEntry" EXCEPT SELECT "featureId","organisationId","projectId","layerId","isPublished","isArchived","isDraft","isVisitable","isIntangible","countryId","areaId","districtId","townId","ruralAreaId","macrohoodId","neighbourhoodId","villageId","microhoodId","hamletId","islandId" FROM "featureCountEntry");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","generation","attempts","retryAt","lastError" FROM "featureDivisionJob" EXCEPT SELECT __original_rowid,"featureId","generation","attempts","retryAt","lastError" FROM "__audit_backup_featureDivisionJob") AND NOT EXISTS(SELECT __original_rowid,"featureId","generation","attempts","retryAt","lastError" FROM "__audit_backup_featureDivisionJob" EXCEPT SELECT rowid,"featureId","generation","attempts","retryAt","lastError" FROM "featureDivisionJob");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","divisionId","selected" FROM "featureDivisionMembership" EXCEPT SELECT __original_rowid,"featureId","divisionId","selected" FROM "__audit_backup_featureDivisionMembership") AND NOT EXISTS(SELECT __original_rowid,"featureId","divisionId","selected" FROM "__audit_backup_featureDivisionMembership" EXCEPT SELECT rowid,"featureId","divisionId","selected" FROM "featureDivisionMembership");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "featureI18n" EXCEPT SELECT __original_rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "__audit_backup_featureI18n") AND NOT EXISTS(SELECT __original_rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "__audit_backup_featureI18n" EXCEPT SELECT rowid,"featureId","locale","title","titleGen","description","descriptionGen","displayAddress","displayAddressGen","addressProperties" FROM "featureI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "featureImage" EXCEPT SELECT __original_rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "__audit_backup_featureImage") AND NOT EXISTS(SELECT __original_rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "__audit_backup_featureImage" EXCEPT SELECT rowid,"featureId","imageId","intent","isPublished","publishedAt","publisherId","localIsPublished" FROM "featureImage");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "featureLocation" EXCEPT SELECT __original_rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "__audit_backup_featureLocation") AND NOT EXISTS(SELECT __original_rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "__audit_backup_featureLocation" EXCEPT SELECT rowid,"featureId","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","version","actorId","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","acceptedGeometry","acceptancePolicy","acceptanceProposalId" FROM "featureLocation");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "featureLocationHistory" EXCEPT SELECT __original_rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "__audit_backup_featureLocationHistory") AND NOT EXISTS(SELECT __original_rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "__audit_backup_featureLocationHistory" EXCEPT SELECT rowid,"id","featureId","version","previousRevision","action","locationId","factsRevisionId","locationRevisionId","acceptedOverrides","actorId","createdAt","factsOrganisationRevision","locationOrganisationRevision","occupancyRevisionId","addressRevisionId","membershipRevisionIds","placementOverrides","geometry","policySnapshot","adoptionProposalId" FROM "featureLocationHistory");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "featureLocationMembership" EXCEPT SELECT __original_rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "__audit_backup_featureLocationMembership") AND NOT EXISTS(SELECT __original_rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "__audit_backup_featureLocationMembership" EXCEPT SELECT rowid,"featureId","containerLocationId","role","bindingVersion","occupancyRevisionId","membershipRevisionId" FROM "featureLocationMembership");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "featureMtrJob" EXCEPT SELECT __original_rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "__audit_backup_featureMtrJob") AND NOT EXISTS(SELECT __original_rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "__audit_backup_featureMtrJob" EXCEPT SELECT rowid,"featureId","geometry","attempts","retryAt","leaseUntil","lastError" FROM "featureMtrJob");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "featureProperty" EXCEPT SELECT __original_rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "__audit_backup_featureProperty") AND NOT EXISTS(SELECT __original_rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "__audit_backup_featureProperty" EXCEPT SELECT rowid,"featureId","propertyId","propertyValueId","value","valueJson" FROM "featureProperty");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","propertyId","locale","value","valueGen" FROM "featurePropertyI18n" EXCEPT SELECT __original_rowid,"featureId","propertyId","locale","value","valueGen" FROM "__audit_backup_featurePropertyI18n") AND NOT EXISTS(SELECT __original_rowid,"featureId","propertyId","locale","value","valueGen" FROM "__audit_backup_featurePropertyI18n" EXCEPT SELECT rowid,"featureId","propertyId","locale","value","valueGen" FROM "featurePropertyI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","featureId","locale" FROM "featureSearchDocument" EXCEPT SELECT __original_rowid,"id","featureId","locale" FROM "__audit_backup_featureSearchDocument") AND NOT EXISTS(SELECT __original_rowid,"id","featureId","locale" FROM "__audit_backup_featureSearchDocument" EXCEPT SELECT rowid,"id","featureId","locale" FROM "featureSearchDocument");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "featureSpatial" EXCEPT SELECT __original_rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "__audit_backup_featureSpatial") AND NOT EXISTS(SELECT __original_rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "__audit_backup_featureSpatial" EXCEPT SELECT rowid,"featureId","resolution","cell","layerId","longitude","latitude" FROM "featureSpatial");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "hub" EXCEPT SELECT __original_rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "__audit_backup_hub") AND NOT EXISTS(SELECT __original_rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "__audit_backup_hub" EXCEPT SELECT rowid,"id","code","domain","isArchived","createdAt","modifiedAt","imageId","isPublished","isSubscriptionAvailable","subscriptionService","subscriptionId","subscriptionPlacement","legalContactAddress","subscriptionSessionCookie" FROM "hub");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "hubI18n" EXCEPT SELECT __original_rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "__audit_backup_hubI18n") AND NOT EXISTS(SELECT __original_rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "__audit_backup_hubI18n" EXCEPT SELECT rowid,"hubId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen","privacyPolicy","termsOfService","subscriptionBenefits","subscriptionBenefitsGen","privacyPolicyGen","termsOfServiceGen" FROM "hubI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"hubId","layerId","isDefaultVisible" FROM "hubLayer" EXCEPT SELECT __original_rowid,"hubId","layerId","isDefaultVisible" FROM "__audit_backup_hubLayer") AND NOT EXISTS(SELECT __original_rowid,"hubId","layerId","isDefaultVisible" FROM "__audit_backup_hubLayer" EXCEPT SELECT rowid,"hubId","layerId","isDefaultVisible" FROM "hubLayer");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"hubId","propertyId","rank" FROM "hubProperty" EXCEPT SELECT __original_rowid,"hubId","propertyId","rank" FROM "__audit_backup_hubProperty") AND NOT EXISTS(SELECT __original_rowid,"hubId","propertyId","rank" FROM "__audit_backup_hubProperty" EXCEPT SELECT rowid,"hubId","propertyId","rank" FROM "hubProperty");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"hubId","userId","role" FROM "hubRole" EXCEPT SELECT __original_rowid,"hubId","userId","role" FROM "__audit_backup_hubRole") AND NOT EXISTS(SELECT __original_rowid,"hubId","userId","role" FROM "__audit_backup_hubRole" EXCEPT SELECT rowid,"hubId","userId","role" FROM "hubRole");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "hubUserState" EXCEPT SELECT __original_rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "__audit_backup_hubUserState") AND NOT EXISTS(SELECT __original_rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "__audit_backup_hubUserState" EXCEPT SELECT rowid,"hubId","userId","subscriptionPromptDismissed","subscriptionMember","hasAgreedToTerms","createdAt","modifiedAt" FROM "hubUserState");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "image" EXCEPT SELECT __original_rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "__audit_backup_image") AND NOT EXISTS(SELECT __original_rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "__audit_backup_image" EXCEPT SELECT rowid,"id","contributorId","cdn","env","cdnId","publicId","version","isArchived","createdAt","modifiedAt","localIsArchived","presentationMode","contentHash" FROM "image");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "layer" EXCEPT SELECT __original_rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "__audit_backup_layer") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "__audit_backup_layer" EXCEPT SELECT rowid,"id","organisationId","projectId","metadata","isDefaultVisible","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","rank","relocationPolicy","relocationPolicyRevision","historicalSourceLayerId" FROM "layer");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "layerI18n" EXCEPT SELECT __original_rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_layerI18n") AND NOT EXISTS(SELECT __original_rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_layerI18n" EXCEPT SELECT rowid,"layerId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "layerI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "layerProperty" EXCEPT SELECT __original_rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "__audit_backup_layerProperty") AND NOT EXISTS(SELECT __original_rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "__audit_backup_layerProperty" EXCEPT SELECT rowid,"layerId","propertyId","isVisible","isUserContributable" FROM "layerProperty");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "location" EXCEPT SELECT __original_rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "__audit_backup_location") AND NOT EXISTS(SELECT __original_rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "__audit_backup_location" EXCEPT SELECT rowid,"id","ssId","ownerOrganisationId","state","sourceAvailability","redirectTargetId","redirect","createdAt","kind" FROM "location");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "locationAccessibility" EXCEPT SELECT __original_rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "__audit_backup_locationAccessibility") AND NOT EXISTS(SELECT __original_rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "__audit_backup_locationAccessibility" EXCEPT SELECT rowid,"id","locationId","previousRevisionId","locationRevisionId","placementKey","valuesJson","actorId","recordedAt" FROM "locationAccessibility");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "locationAddress" EXCEPT SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "__audit_backup_locationAddress") AND NOT EXISTS(SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "__audit_backup_locationAddress" EXCEPT SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","locationId","addressRevisionId","priority","addressState" FROM "locationAddress");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "locationAdoptionProposal" EXCEPT SELECT __original_rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "__audit_backup_locationAdoptionProposal") AND NOT EXISTS(SELECT __original_rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "__audit_backup_locationAdoptionProposal" EXCEPT SELECT rowid,"id","featureId","projectId","locationId","candidateRevisionId","associationRevision","featureModifiedAt","policyRevision","evidence","factsDecision","locationDecision","organisationRevision","createdAt","occupancyRevisionId","addressRevisionId","layerId","layerPolicyRevision" FROM "locationAdoptionProposal");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "locationIdentityHistory" EXCEPT SELECT __original_rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "__audit_backup_locationIdentityHistory") AND NOT EXISTS(SELECT __original_rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "__audit_backup_locationIdentityHistory" EXCEPT SELECT rowid,"id","locationId","previousHistoryId","previousState","previousSsId","ssId","sourceRevisionId","actorId","reason","reviewId","createdAt" FROM "locationIdentityHistory");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "locationIdentityReview" EXCEPT SELECT __original_rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "__audit_backup_locationIdentityReview") AND NOT EXISTS(SELECT __original_rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "__audit_backup_locationIdentityReview" EXCEPT SELECT rowid,"id","locationId","ownerOrganisationId","baseline","projection","actorId","mergeReviews","rejection","createdAt" FROM "locationIdentityReview");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "locationMembership" EXCEPT SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "__audit_backup_locationMembership") AND NOT EXISTS(SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "__audit_backup_locationMembership" EXCEPT SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","childLocationId","parentLocationId","membershipState" FROM "locationMembership");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "locationOccupancy" EXCEPT SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "__audit_backup_locationOccupancy") AND NOT EXISTS(SELECT __original_rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "__audit_backup_locationOccupancy" EXCEPT SELECT rowid,"id","relationshipId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","establishmentLocationId","containerLocationId","addressRevisionId","occupancyState" FROM "locationOccupancy");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "locationRelationshipOperation" EXCEPT SELECT __original_rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "__audit_backup_locationRelationshipOperation") AND NOT EXISTS(SELECT __original_rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "__audit_backup_locationRelationshipOperation" EXCEPT SELECT rowid,"id","scopeOrganisationId","locationId","rawSource","recordedAt" FROM "locationRelationshipOperation");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "locationRematchJob" EXCEPT SELECT __original_rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "__audit_backup_locationRematchJob") AND NOT EXISTS(SELECT __original_rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "__audit_backup_locationRematchJob" EXCEPT SELECT rowid,"id","featureId","projectId","locationId","intent","baseline","publication","generation","status","candidates","candidateCursor","incomplete","reason","attempts","retryAt","createdAt" FROM "locationRematchJob");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"reviewId","jobId","generation","ssId","evidence" FROM "locationRematchReview" EXCEPT SELECT __original_rowid,"reviewId","jobId","generation","ssId","evidence" FROM "__audit_backup_locationRematchReview") AND NOT EXISTS(SELECT __original_rowid,"reviewId","jobId","generation","ssId","evidence" FROM "__audit_backup_locationRematchReview" EXCEPT SELECT rowid,"reviewId","jobId","generation","ssId","evidence" FROM "locationRematchReview");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "locationRevision" EXCEPT SELECT __original_rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "__audit_backup_locationRevision") AND NOT EXISTS(SELECT __original_rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "__audit_backup_locationRevision" EXCEPT SELECT rowid,"id","locationId","version","origin","ssId","apiVersion","releaseId","snapshotId","contentHash","rawSource","facts","createdAt" FROM "locationRevision");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "locationTransition" EXCEPT SELECT __original_rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "__audit_backup_locationTransition") AND NOT EXISTS(SELECT __original_rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "__audit_backup_locationTransition" EXCEPT SELECT rowid,"id","transitionId","previousRevisionId","scopeOrganisationId","assertionState","evidence","observedAt","verifiedAt","effectiveFrom","effectiveTo","effectiveFromPrecision","effectiveToPrecision","provenance","actorId","recordedAt","type","basis" FROM "locationTransition");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"transitionRevisionId","locationId","side" FROM "locationTransitionParticipant" EXCEPT SELECT __original_rowid,"transitionRevisionId","locationId","side" FROM "__audit_backup_locationTransitionParticipant") AND NOT EXISTS(SELECT __original_rowid,"transitionRevisionId","locationId","side" FROM "__audit_backup_locationTransitionParticipant" EXCEPT SELECT rowid,"transitionRevisionId","locationId","side" FROM "locationTransitionParticipant");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "mapStyleI18n" EXCEPT SELECT __original_rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "__audit_backup_mapStyleI18n") AND NOT EXISTS(SELECT __original_rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "__audit_backup_mapStyleI18n" EXCEPT SELECT rowid,"mapStyleId","locale","name","nameGen","description","descriptionGen" FROM "mapStyleI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "mapStyles" EXCEPT SELECT __original_rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "__audit_backup_mapStyles") AND NOT EXISTS(SELECT __original_rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "__audit_backup_mapStyles" EXCEPT SELECT rowid,"id","code","organisationId","hubId","previewImagePath","createdAt","modifiedAt" FROM "mapStyles");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "messagingAccount" EXCEPT SELECT __original_rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "__audit_backup_messagingAccount") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "__audit_backup_messagingAccount" EXCEPT SELECT rowid,"id","organisationId","platform","bridgeAccountId","externalAccountId","displayName","enabled","inboxCursor","registeredBy","createdAt","updatedAt","archiveCursor" FROM "messagingAccount");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "messagingConversation" EXCEPT SELECT __original_rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "__audit_backup_messagingConversation") AND NOT EXISTS(SELECT __original_rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "__audit_backup_messagingConversation" EXCEPT SELECT rowid,"id","accountId","chatId","recipientUserId","displayName","lastMessageAt","isArchived","archiveSequence","pinnedAt" FROM "messagingConversation");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "messagingMessage" EXCEPT SELECT __original_rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "__audit_backup_messagingMessage") AND NOT EXISTS(SELECT __original_rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "__audit_backup_messagingMessage" EXCEPT SELECT rowid,"accountId","chatId","messageId","senderId","sourceSequence","timestamp","payload" FROM "messagingMessage");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "messagingPhoneLookup" EXCEPT SELECT __original_rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "__audit_backup_messagingPhoneLookup") AND NOT EXISTS(SELECT __original_rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "__audit_backup_messagingPhoneLookup" EXCEPT SELECT rowid,"accountId","userId","externalAccountId","telephone","address","reason","checkedAt","expiresAt" FROM "messagingPhoneLookup");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "messagingSend" EXCEPT SELECT __original_rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "__audit_backup_messagingSend") AND NOT EXISTS(SELECT __original_rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "__audit_backup_messagingSend" EXCEPT SELECT rowid,"accountId","requestId","actorUserId","recipientUserId","request","state","messageId","createdAt","updatedAt" FROM "messagingSend");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "organisation" EXCEPT SELECT __original_rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "__audit_backup_organisation") AND NOT EXISTS(SELECT __original_rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "__audit_backup_organisation" EXCEPT SELECT rowid,"id","code","url","imageId","hubId","isHubExclusive","isCoreInclusive","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","capabilities","defaultLocationVisibility","settings" FROM "organisation");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "organisationI18n" EXCEPT SELECT __original_rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_organisationI18n") AND NOT EXISTS(SELECT __original_rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_organisationI18n" EXCEPT SELECT rowid,"organisationId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "organisationI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "organisationLocation" EXCEPT SELECT __original_rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "__audit_backup_organisationLocation") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "__audit_backup_organisationLocation" EXCEPT SELECT rowid,"id","organisationId","locationId","previousRevisionId","overrides","provenance","actorId","createdAt" FROM "organisationLocation");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"organisationId","propertyId","rank" FROM "organisationProperty" EXCEPT SELECT __original_rowid,"organisationId","propertyId","rank" FROM "__audit_backup_organisationProperty") AND NOT EXISTS(SELECT __original_rowid,"organisationId","propertyId","rank" FROM "__audit_backup_organisationProperty" EXCEPT SELECT rowid,"organisationId","propertyId","rank" FROM "organisationProperty");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"organisationId","userId","role","grant" FROM "organisationRole" EXCEPT SELECT __original_rowid,"organisationId","userId","role","grant" FROM "__audit_backup_organisationRole") AND NOT EXISTS(SELECT __original_rowid,"organisationId","userId","role","grant" FROM "__audit_backup_organisationRole" EXCEPT SELECT rowid,"organisationId","userId","role","grant" FROM "organisationRole");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "organisationUserPolicy" EXCEPT SELECT __original_rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "__audit_backup_organisationUserPolicy") AND NOT EXISTS(SELECT __original_rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "__audit_backup_organisationUserPolicy" EXCEPT SELECT rowid,"organisationId","enabled","hubSignIn","emailDomain","customCard","revision" FROM "organisationUserPolicy");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "passkey" EXCEPT SELECT __original_rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "__audit_backup_passkey") AND NOT EXISTS(SELECT __original_rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "__audit_backup_passkey" EXCEPT SELECT rowid,"id","name","publicKey","userId","credentialID","counter","deviceType","backedUp","transports","createdAt","aaguid" FROM "passkey");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "project" EXCEPT SELECT __original_rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "__audit_backup_project") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "__audit_backup_project" EXCEPT SELECT rowid,"id","organisationId","code","imageId","isPublished","publishedAt","publisherId","isArchived","createdAt","modifiedAt","localIsPublished","localIsArchived","capabilities","license","useAllInOrgContext","cardStyleCode","markerStyleCode","locationPolicy","locationPolicyRevision","flags","settings" FROM "project");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "projectI18n" EXCEPT SELECT __original_rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_projectI18n") AND NOT EXISTS(SELECT __original_rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "__audit_backup_projectI18n" EXCEPT SELECT rowid,"projectId","locale","name","nameGen","nameShort","nameShortGen","description","descriptionGen" FROM "projectI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "projectMapStyles" EXCEPT SELECT __original_rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "__audit_backup_projectMapStyles") AND NOT EXISTS(SELECT __original_rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "__audit_backup_projectMapStyles" EXCEPT SELECT rowid,"projectId","mapStyleId","createdAt","modifiedAt" FROM "projectMapStyles");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "projectProperty" EXCEPT SELECT __original_rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "__audit_backup_projectProperty") AND NOT EXISTS(SELECT __original_rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "__audit_backup_projectProperty" EXCEPT SELECT rowid,"projectId","propertyId","rank","isEnabled","isDefaultEnabled" FROM "projectProperty");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"projectId","userId","role","capabilities" FROM "projectRole" EXCEPT SELECT __original_rowid,"projectId","userId","role","capabilities" FROM "__audit_backup_projectRole") AND NOT EXISTS(SELECT __original_rowid,"projectId","userId","role","capabilities" FROM "__audit_backup_projectRole" EXCEPT SELECT rowid,"projectId","userId","role","capabilities" FROM "projectRole");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "property" EXCEPT SELECT __original_rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "__audit_backup_property") AND NOT EXISTS(SELECT __original_rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "__audit_backup_property" EXCEPT SELECT rowid,"id","projectId","organisationId","hubId","scope","type","key","isTranslatable","component","min","max","isUserContributable","isDefaultEnabled","createdAt","modifiedAt","cardinality","presentation","audience","dataType","dateResolution","timeMaxHour" FROM "property");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "propertyI18n" EXCEPT SELECT __original_rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "__audit_backup_propertyI18n") AND NOT EXISTS(SELECT __original_rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "__audit_backup_propertyI18n" EXCEPT SELECT rowid,"propertyId","locale","label","labelGen","placeholder","placeholderGen" FROM "propertyI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","propertyId","rank","value" FROM "propertyValue" EXCEPT SELECT __original_rowid,"id","propertyId","rank","value" FROM "__audit_backup_propertyValue") AND NOT EXISTS(SELECT __original_rowid,"id","propertyId","rank","value" FROM "__audit_backup_propertyValue" EXCEPT SELECT rowid,"id","propertyId","rank","value" FROM "propertyValue");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"propertyValueId","locale","value","valueGen" FROM "propertyValueI18n" EXCEPT SELECT __original_rowid,"propertyValueId","locale","value","valueGen" FROM "__audit_backup_propertyValueI18n") AND NOT EXISTS(SELECT __original_rowid,"propertyValueId","locale","value","valueGen" FROM "__audit_backup_propertyValueI18n" EXCEPT SELECT rowid,"propertyValueId","locale","value","valueGen" FROM "propertyValueI18n");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "session" EXCEPT SELECT __original_rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "__audit_backup_session") AND NOT EXISTS(SELECT __original_rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "__audit_backup_session" EXCEPT SELECT rowid,"id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt" FROM "session");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "task" EXCEPT SELECT __original_rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "__audit_backup_task") AND NOT EXISTS(SELECT __original_rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "__audit_backup_task" EXCEPT SELECT rowid,"id","organisationId","projectId","featureId","contributorId","reviewerId","type","message","isReviewed","reviewOutcome","reviewAction","reviewReason","createdAt","modifiedAt","isDraft" FROM "task");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"taskId","imageId" FROM "taskImage" EXCEPT SELECT __original_rowid,"taskId","imageId" FROM "__audit_backup_taskImage") AND NOT EXISTS(SELECT __original_rowid,"taskId","imageId" FROM "__audit_backup_taskImage" EXCEPT SELECT rowid,"taskId","imageId" FROM "taskImage");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "user" EXCEPT SELECT __original_rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "__audit_backup_user") AND NOT EXISTS(SELECT __original_rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "__audit_backup_user" EXCEPT SELECT rowid,"id","name","email","emailVerified","image","locale","attribution","isArchived","preferences","experimental","createdAt","updatedAt","username","isAnonymous","telephone","displayUsername","preferredMessagingPlatform" FROM "user");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"userId","loginCount","lastLogin" FROM "userActivity" EXCEPT SELECT __original_rowid,"userId","loginCount","lastLogin" FROM "__audit_backup_userActivity") AND NOT EXISTS(SELECT __original_rowid,"userId","loginCount","lastLogin" FROM "__audit_backup_userActivity" EXCEPT SELECT rowid,"userId","loginCount","lastLogin" FROM "userActivity");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "userFeature" EXCEPT SELECT __original_rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "__audit_backup_userFeature") AND NOT EXISTS(SELECT __original_rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "__audit_backup_userFeature" EXCEPT SELECT rowid,"userId","featureId","isVisited","isWishlisted","visitedAt","createdAt","modifiedAt" FROM "userFeature");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"layerId","userId","hubId","isDefaultVisible" FROM "userLayer" EXCEPT SELECT __original_rowid,"layerId","userId","hubId","isDefaultVisible" FROM "__audit_backup_userLayer") AND NOT EXISTS(SELECT __original_rowid,"layerId","userId","hubId","isDefaultVisible" FROM "__audit_backup_userLayer" EXCEPT SELECT rowid,"layerId","userId","hubId","isDefaultVisible" FROM "userLayer");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "userMessagingIdentity" EXCEPT SELECT __original_rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "__audit_backup_userMessagingIdentity") AND NOT EXISTS(SELECT __original_rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "__audit_backup_userMessagingIdentity" EXCEPT SELECT rowid,"userId","platform","phoneNumber","username","nativeId","sourceTelephone","verifiedAt","verifiedBy","updatedAt" FROM "userMessagingIdentity");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT rowid,"userId","platform","nativeId" FROM "userMessagingIdentityAlias" EXCEPT SELECT __original_rowid,"userId","platform","nativeId" FROM "__audit_backup_userMessagingIdentityAlias") AND NOT EXISTS(SELECT __original_rowid,"userId","platform","nativeId" FROM "__audit_backup_userMessagingIdentityAlias" EXCEPT SELECT rowid,"userId","platform","nativeId" FROM "userMessagingIdentityAlias");
INSERT INTO __audit_column_order_guard SELECT NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE "__audit_backup_account";
DROP TABLE "__audit_backup_breadlineImportFeature";
DROP TABLE "__audit_backup_breadlineImportIdentity";
DROP TABLE "__audit_backup_breadlineImportUser";
DROP TABLE "__audit_backup_feature";
DROP TABLE "__audit_backup_featureCountEntry";
DROP TABLE "__audit_backup_featureDivisionJob";
DROP TABLE "__audit_backup_featureDivisionMembership";
DROP TABLE "__audit_backup_featureI18n";
DROP TABLE "__audit_backup_featureImage";
DROP TABLE "__audit_backup_featureLocation";
DROP TABLE "__audit_backup_featureLocationHistory";
DROP TABLE "__audit_backup_featureLocationMembership";
DROP TABLE "__audit_backup_featureMtrJob";
DROP TABLE "__audit_backup_featureProperty";
DROP TABLE "__audit_backup_featurePropertyI18n";
DROP TABLE "__audit_backup_featureSearchDocument";
DROP TABLE "__audit_backup_featureSpatial";
DROP TABLE "__audit_backup_hub";
DROP TABLE "__audit_backup_hubI18n";
DROP TABLE "__audit_backup_hubLayer";
DROP TABLE "__audit_backup_hubProperty";
DROP TABLE "__audit_backup_hubRole";
DROP TABLE "__audit_backup_hubUserState";
DROP TABLE "__audit_backup_image";
DROP TABLE "__audit_backup_layer";
DROP TABLE "__audit_backup_layerI18n";
DROP TABLE "__audit_backup_layerProperty";
DROP TABLE "__audit_backup_location";
DROP TABLE "__audit_backup_locationAccessibility";
DROP TABLE "__audit_backup_locationAddress";
DROP TABLE "__audit_backup_locationAdoptionProposal";
DROP TABLE "__audit_backup_locationIdentityHistory";
DROP TABLE "__audit_backup_locationIdentityReview";
DROP TABLE "__audit_backup_locationMembership";
DROP TABLE "__audit_backup_locationOccupancy";
DROP TABLE "__audit_backup_locationRelationshipOperation";
DROP TABLE "__audit_backup_locationRematchJob";
DROP TABLE "__audit_backup_locationRematchReview";
DROP TABLE "__audit_backup_locationRevision";
DROP TABLE "__audit_backup_locationTransition";
DROP TABLE "__audit_backup_locationTransitionParticipant";
DROP TABLE "__audit_backup_mapStyleI18n";
DROP TABLE "__audit_backup_mapStyles";
DROP TABLE "__audit_backup_messagingAccount";
DROP TABLE "__audit_backup_messagingConversation";
DROP TABLE "__audit_backup_messagingMessage";
DROP TABLE "__audit_backup_messagingPhoneLookup";
DROP TABLE "__audit_backup_messagingSend";
DROP TABLE "__audit_backup_organisation";
DROP TABLE "__audit_backup_organisationI18n";
DROP TABLE "__audit_backup_organisationLocation";
DROP TABLE "__audit_backup_organisationProperty";
DROP TABLE "__audit_backup_organisationRole";
DROP TABLE "__audit_backup_organisationUserPolicy";
DROP TABLE "__audit_backup_passkey";
DROP TABLE "__audit_backup_project";
DROP TABLE "__audit_backup_projectI18n";
DROP TABLE "__audit_backup_projectMapStyles";
DROP TABLE "__audit_backup_projectProperty";
DROP TABLE "__audit_backup_projectRole";
DROP TABLE "__audit_backup_property";
DROP TABLE "__audit_backup_propertyI18n";
DROP TABLE "__audit_backup_propertyValue";
DROP TABLE "__audit_backup_propertyValueI18n";
DROP TABLE "__audit_backup_session";
DROP TABLE "__audit_backup_task";
DROP TABLE "__audit_backup_taskImage";
DROP TABLE "__audit_backup_user";
DROP TABLE "__audit_backup_userActivity";
DROP TABLE "__audit_backup_userFeature";
DROP TABLE "__audit_backup_userLayer";
DROP TABLE "__audit_backup_userMessagingIdentity";
DROP TABLE "__audit_backup_userMessagingIdentityAlias";
DROP TABLE __audit_column_order_sequence;
DROP TABLE __audit_column_order_guard;
-- Clear SQLite deferred parent-drop debt only after explicit foreign-key validation.
PRAGMA defer_foreign_keys=OFF;
