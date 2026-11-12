ALTER TABLE fieldResearchStack ADD COLUMN name TEXT;
ALTER TABLE fieldResearchStack ADD COLUMN featureType TEXT;
ALTER TABLE fieldResearchSession ADD COLUMN layerId TEXT REFERENCES layer(id);
