-- Refs #199, #194. Seed effective brand identities while Place inheritance is pending.
-- Narrowly replace only the generic Independent classifier on known imported
-- Breadline donors. Independently edited brand assignments remain unchanged.
INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrFreshW01',id,7,'fresh-wheat' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Fresh Wheat Bakery',0 FROM propertyValue WHERE id='blBrFreshW01' AND propertyId='WhWlW8KcN2wq' AND value='fresh-wheat' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Fresh Wheat Bakery',0 FROM propertyValue WHERE id='blBrFreshW01' AND propertyId='WhWlW8KcN2wq' AND value='fresh-wheat' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Fresh Wheat Bakery',0 FROM propertyValue WHERE id='blBrFreshW01' AND propertyId='WhWlW8KcN2wq' AND value='fresh-wheat' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrFreshW01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrFreshW01' AND v.propertyId=featureProperty.propertyId AND v.value='fresh-wheat')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Fresh Wheat Bakery - Happy Valley');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrPenins01',id,8,'peninsula' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','The Peninsula',0 FROM propertyValue WHERE id='blBrPenins01' AND propertyId='WhWlW8KcN2wq' AND value='peninsula' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','The Peninsula',0 FROM propertyValue WHERE id='blBrPenins01' AND propertyId='WhWlW8KcN2wq' AND value='peninsula' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','The Peninsula',0 FROM propertyValue WHERE id='blBrPenins01' AND propertyId='WhWlW8KcN2wq' AND value='peninsula' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrPenins01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrPenins01' AND v.propertyId=featureProperty.propertyId AND v.value='peninsula')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='The Peninsula Hong Kong');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrGarden01',id,9,'garden' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Garden',0 FROM propertyValue WHERE id='blBrGarden01' AND propertyId='WhWlW8KcN2wq' AND value='garden' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Garden',0 FROM propertyValue WHERE id='blBrGarden01' AND propertyId='WhWlW8KcN2wq' AND value='garden' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Garden',0 FROM propertyValue WHERE id='blBrGarden01' AND propertyId='WhWlW8KcN2wq' AND value='garden' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrGarden01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrGarden01' AND v.propertyId=featureProperty.propertyId AND v.value='garden')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Garden');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrDeedee01',id,10,'deedee' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Dee Dee Bakery',0 FROM propertyValue WHERE id='blBrDeedee01' AND propertyId='WhWlW8KcN2wq' AND value='deedee' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Dee Dee Bakery',0 FROM propertyValue WHERE id='blBrDeedee01' AND propertyId='WhWlW8KcN2wq' AND value='deedee' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Dee Dee Bakery',0 FROM propertyValue WHERE id='blBrDeedee01' AND propertyId='WhWlW8KcN2wq' AND value='deedee' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrDeedee01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrDeedee01' AND v.propertyId=featureProperty.propertyId AND v.value='deedee')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Dee Dee Bakery');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrChildh01',id,11,'childhood' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Childhood Bakery',0 FROM propertyValue WHERE id='blBrChildh01' AND propertyId='WhWlW8KcN2wq' AND value='childhood' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Childhood Bakery',0 FROM propertyValue WHERE id='blBrChildh01' AND propertyId='WhWlW8KcN2wq' AND value='childhood' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Childhood Bakery',0 FROM propertyValue WHERE id='blBrChildh01' AND propertyId='WhWlW8KcN2wq' AND value='childhood' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrChildh01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrChildh01' AND v.propertyId=featureProperty.propertyId AND v.value='childhood')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Childhood Bakery');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrNibble01',id,12,'nibbles' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Nibbles Baking Nook',0 FROM propertyValue WHERE id='blBrNibble01' AND propertyId='WhWlW8KcN2wq' AND value='nibbles' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Nibbles Baking Nook',0 FROM propertyValue WHERE id='blBrNibble01' AND propertyId='WhWlW8KcN2wq' AND value='nibbles' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Nibbles Baking Nook',0 FROM propertyValue WHERE id='blBrNibble01' AND propertyId='WhWlW8KcN2wq' AND value='nibbles' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrNibble01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrNibble01' AND v.propertyId=featureProperty.propertyId AND v.value='nibbles')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Nibbles Baking Nook');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrHarlan01',id,13,'harlans' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Harlan’s',0 FROM propertyValue WHERE id='blBrHarlan01' AND propertyId='WhWlW8KcN2wq' AND value='harlans' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Harlan’s',0 FROM propertyValue WHERE id='blBrHarlan01' AND propertyId='WhWlW8KcN2wq' AND value='harlans' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Harlan’s',0 FROM propertyValue WHERE id='blBrHarlan01' AND propertyId='WhWlW8KcN2wq' AND value='harlans' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrHarlan01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrHarlan01' AND v.propertyId=featureProperty.propertyId AND v.value='harlans')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Harlan''s');

INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'blBrWooloo01',id,14,'wooloomooloo' FROM property WHERE id='WhWlW8KcN2wq' AND key='brand' ON CONFLICT(id) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'en','Wooloomooloo Prime',0 FROM propertyValue WHERE id='blBrWooloo01' AND propertyId='WhWlW8KcN2wq' AND value='wooloomooloo' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hans','Wooloomooloo Prime',0 FROM propertyValue WHERE id='blBrWooloo01' AND propertyId='WhWlW8KcN2wq' AND value='wooloomooloo' ON CONFLICT(propertyValueId,locale) DO NOTHING;
INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) SELECT id,'zh-hant','Wooloomooloo Prime',0 FROM propertyValue WHERE id='blBrWooloo01' AND propertyId='WhWlW8KcN2wq' AND value='wooloomooloo' ON CONFLICT(propertyValueId,locale) DO NOTHING;
UPDATE featureProperty SET propertyValueId='blBrWooloo01'
WHERE propertyId='WhWlW8KcN2wq' AND propertyValueId='blBrandInd01' AND value IS NULL
  AND EXISTS (SELECT 1 FROM propertyValue v WHERE v.id='blBrWooloo01' AND v.propertyId=featureProperty.propertyId AND v.value='wooloomooloo')
  AND featureId IN (SELECT b.featureId FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE b.sourceTable='donors' AND p.code='breadline' AND o.code='hkfoodworks'
      AND i.title='Wooloomooloo Prime');

