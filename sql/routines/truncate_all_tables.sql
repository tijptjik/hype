-- ═══════════════════════════════════════════════════════════════════════════════════════
-- TRUNCATE ALL BUSINESS DATA (PRESERVE SCHEMA & MIGRATION HISTORY)
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- Truncate in reverse dependency order to avoid FK constraint errors
-- Level 4 (most dependent)
DELETE FROM featureProperty;
DELETE FROM featurePropertyI18n;
DELETE FROM featureImage;
DELETE FROM layerProperty;
DELETE FROM userFeature;
DELETE FROM userLayer;
DELETE FROM hubLayer;
DELETE FROM hubUserState;
DELETE FROM taskImage;
DELETE FROM organisationRole;
DELETE FROM projectRole;
DELETE FROM projectMapStyles;
DELETE FROM mapStyleI18n;
DELETE FROM projectProperty;
DELETE FROM hubProperty;
DELETE FROM organisationProperty;
DELETE FROM userActivity;
DELETE FROM session;
DELETE FROM verification;

-- Level 3
DELETE FROM feature;
DELETE FROM featureI18n;
DELETE FROM task;
DELETE FROM account;

-- Level 2
DELETE FROM layer;
DELETE FROM layerI18n;
DELETE FROM project;
DELETE FROM projectI18n;
DELETE FROM organisation;
DELETE FROM organisationI18n;
DELETE FROM mapStyles;
DELETE FROM hub;
DELETE FROM hubI18n;
DELETE FROM hubRole;
DELETE FROM user;
DELETE FROM image;
DELETE FROM propertyValue;
DELETE FROM propertyValueI18n;

-- Level 1
DELETE FROM property;
DELETE FROM propertyI18n;

-- Level 0 (least dependent) - these are left for reference but shouldn't be needed
-- No deletes for base tables that don't have business data

-- Note: d1_migrations table is intentionally NOT truncated to preserve migration history

-- Reset auto-increment sequences
DELETE FROM sqlite_sequence; 
