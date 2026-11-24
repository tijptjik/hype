-- Existing captures predate realm selection and carry no inferred placement.
ALTER TABLE fieldResearchRecord ADD COLUMN spatialRealm TEXT CHECK (spatialRealm IN ('interior', 'exterior'));
ALTER TABLE fieldResearchRecord ADD COLUMN locationId TEXT REFERENCES location(id);
ALTER TABLE fieldResearchRecord ADD COLUMN pin TEXT CHECK (pin IS NULL OR (locationId IS NOT NULL AND spatialRealm IS NOT NULL AND json_extract(pin, '$.realm') IS spatialRealm));
