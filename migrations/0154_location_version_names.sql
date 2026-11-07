-- Refs #194. Pre-release v1 naming; preserve every value, hash and immutable reference.
ALTER TABLE locationRevision RENAME COLUMN sequence TO version;
ALTER TABLE locationRevision RENAME COLUMN payload TO rawSource;
ALTER TABLE featureLocation RENAME COLUMN revision TO version;
ALTER TABLE featureLocationHistory RENAME COLUMN revision TO version;
