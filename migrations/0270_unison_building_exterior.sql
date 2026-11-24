-- Unison Building, 31–41 Kai Tak Road. Apply after 0268 and 0269.
-- Before release, stage the original assembly alongside its comparison in private R2:
-- node scripts/locations/exterior/stage-unison-assets.ts --apply
-- The viewer resolves texture-comparison.json beneath location-exteriors/<assetId>/.
-- Reviewed comparison SHA-256: dd4a7c0e6610ce589548cc34e2aadc8a0b7eb86209af581d51ff0976d76bdf13.

-- Fail the D1 migration atomically on conflicting identities; never merge by name or address.
CREATE TABLE _0270_unison_guard (
  missing_attribution INTEGER CHECK (missing_attribution = 0),
  conflicting_location INTEGER CHECK (conflicting_location = 0),
  duplicate_building INTEGER CHECK (duplicate_building = 0),
  conflicting_baseline INTEGER CHECK (conflicting_baseline = 0),
  conflicting_asset INTEGER CHECK (conflicting_asset = 0)
);
INSERT INTO _0270_unison_guard (missing_attribution)
SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM organisation WHERE id = '2u4orWMxRNbz' AND code = 'hkfoodworks')
   OR NOT EXISTS (SELECT 1 FROM user WHERE id = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM');

INSERT INTO _0270_unison_guard (conflicting_location)
SELECT 1 FROM location WHERE id = 'IssVInhZb-Gd'
  AND (createdAt <> '2026-11-24T05:14:49.500Z' OR (
    NOT EXISTS (SELECT 1 FROM locationRevision WHERE id = 'lUUfiouJklXj' AND locationId = 'IssVInhZb-Gd')
    AND NOT (kind = 'built' AND class IS 'building' AND state = 'unresolved'
      AND ownerOrganisationId IS '2u4orWMxRNbz' AND ssId IS NULL)));

INSERT INTO _0270_unison_guard (duplicate_building)
SELECT 1 FROM location l JOIN locationRevision r ON r.locationId = l.id
JOIN locationRevisionI18n t ON t.revisionId = r.id
WHERE NOT EXISTS (SELECT 1 FROM locationRevision WHERE id = 'lUUfiouJklXj' AND locationId = 'IssVInhZb-Gd')
  AND l.id <> 'IssVInhZb-Gd' AND l.class = 'building' AND l.state <> 'redirect'
  AND t.locale = 'en' AND t.name = 'Unison Building' COLLATE NOCASE
  AND COALESCE(t.displayAddressOverride,t.displayAddress) = '31-41 Kai Tak Road' COLLATE NOCASE
LIMIT 1;

INSERT INTO _0270_unison_guard (conflicting_baseline)
SELECT 1 FROM locationRevision
WHERE (id = 'lUUfiouJklXj' OR (locationId = 'IssVInhZb-Gd' AND version = 1))
  AND NOT (id = 'lUUfiouJklXj' AND locationId = 'IssVInhZb-Gd' AND version = 1
    AND origin = 'local' AND contentHash = '1d42732992db4a8b89ec000adaca47444047f67a6fe6e9a73ce368d724aac704');

INSERT INTO _0270_unison_guard (conflicting_asset)
SELECT 1 FROM locationExteriorModel WHERE assetId = '57a4845d-1655-4e46-a1ae-6c13d290cfd1'
  AND (locationId <> 'IssVInhZb-Gd' OR sourceModelId <> 'assembly' OR sourceSheet <> '11-NE-11A');

INSERT INTO location (id, ownerOrganisationId, state, sourceAvailability, kind, class, createdAt)
SELECT 'IssVInhZb-Gd', '2u4orWMxRNbz', 'unresolved', 'current', 'built', 'building', '2026-11-24T05:14:49.500Z'
WHERE NOT EXISTS (SELECT 1 FROM location WHERE id = 'IssVInhZb-Gd');

-- Use the writable view so its normal triggers populate the English name and address.
-- Preserve all five reviewed building references, attribution, original IDs and timestamps.
INSERT INTO locationRevisionContent (id, locationId, version, origin, contentHash, rawSource, facts, createdAt)
SELECT 'lUUfiouJklXj', 'IssVInhZb-Gd', 1, 'local',
  '1d42732992db4a8b89ec000adaca47444047f67a6fe6e9a73ce368d724aac704',
  '{"kind":"reviewed-building-evidence","buildingEvidence":{"references":[{"type":"saanseoi","source":{"id":"c98fe6cc-ce18-4ad2-9c49-f9ce074e4532","release":"overture-2026-09-23.1-alpha-987bfb4ed339c25c","addressId":"ss-1e52633e-255b-5b2c-9100-b47f9b945538"},"names":{"en":null,"zh-Hant":null,"zh-Hans":null}},{"type":"saanseoi","source":{"id":"ea484e18-99c7-4bf3-ab45-e9b482f4927c","release":"overture-2026-09-23.1-alpha-987bfb4ed339c25c","addressId":"ss-c569fc05-34f0-54a7-8e54-014a586a4fed"},"names":{"en":null,"zh-Hant":null,"zh-Hans":null}},{"type":"saanseoi","source":{"id":"b722ad66-ec61-47e5-b917-a59e9090a443","release":"overture-2026-09-23.1-alpha-987bfb4ed339c25c","addressId":"ss-a688e806-5548-59bb-b5c9-4072d4ac82a4"},"names":{"en":null,"zh-Hant":null,"zh-Hans":null}},{"type":"saanseoi","source":{"id":"1bc88e2f-51ae-4709-8e76-06bc6f4bd4ff","release":"overture-2026-09-23.1-alpha-987bfb4ed339c25c","addressId":"ss-c5757c85-7154-5fc5-973f-85b04e37ce5f"},"names":{"en":null,"zh-Hant":null,"zh-Hans":null}},{"type":"saanseoi","source":{"id":"aae0202c-6934-4e72-b8d5-fdf322ba4e04","release":"overture-2026-09-23.1-alpha-987bfb4ed339c25c","addressId":"ss-9e6aae6d-bd5b-5c4a-877d-d479f8b00bce"},"names":{"en":null,"zh-Hant":null,"zh-Hans":null}}],"review":"explicit-physical-building"},"actorId":"qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM","organisationId":"2u4orWMxRNbz","input":{"state":"unresolved","kind":"building","sharingPreference":"private","facts":{"names":{"en":"Unison Building"},"phoneNumber":[],"brands":[],"location":{"geometry":{"type":"Point","coordinates":[114.19199013388709,22.32928954151832]},"address":{"status":"unresolved","authored":{"scope":"unknown","i18n":{"en":{"formattedAddress":"31-41 Kai Tak Road"},"zh-hant":{"formattedAddress":""},"zh-hans":{"formattedAddress":""}},"unit":null,"unitI18n":{}},"address2dId":null,"address3dId":null,"address3dUnitId":null,"snapshotId":null,"rawSource":{},"fallbackDisplay":{},"displayOverrides":{"en":"31-41 Kai Tak Road"}}}}}}',
  '{"kind":"building","details":{},"schemaVersion":1,"common":{"location":{"geometry":{"type":"Point","coordinates":[114.19199013388709,22.32928954151832]},"address":{"status":"unresolved","authored":{"scope":"unknown","i18n":{"en":{"formattedAddress":"31-41 Kai Tak Road"},"zh-hant":{"formattedAddress":""},"zh-hans":{"formattedAddress":""}},"unit":null,"unitI18n":{}},"address2dId":null,"address3dId":null,"address3dUnitId":null,"snapshotId":null,"rawSource":{}}}},"i18n":{"en":{"name":"Unison Building","displayAddressOverride":"31-41 Kai Tak Road"}}}',
  '2026-11-24T05:14:49.501Z'
WHERE NOT EXISTS (SELECT 1 FROM locationRevision WHERE id = 'lUUfiouJklXj');

-- On replay, keep any newer reviewed assembly and its saved floor alignments.
INSERT INTO locationExteriorModel (locationId, assetId, sourceModelId, sourceSheet, actorId, createdAt)
SELECT 'IssVInhZb-Gd', '57a4845d-1655-4e46-a1ae-6c13d290cfd1', 'assembly',
  '11-NE-11A', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', '2026-11-24T08:15:54.012Z'
WHERE NOT EXISTS (SELECT 1 FROM locationExteriorModel WHERE locationId = 'IssVInhZb-Gd');

DROP TABLE _0270_unison_guard;
