-- ═══════════════════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE FOREIGN KEY VIOLATION CHECK
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- This file checks for all potential FK violations across all tables

-- organisation FK checks
SELECT 'organisation.imageId → image.id' as violation_type, o.id as record_id, o.imageId as foreign_key_value
FROM organisation o 
LEFT JOIN image i ON o.imageId = i.id 
WHERE o.imageId IS NOT NULL AND i.id IS NULL

UNION ALL

SELECT 'organisation.hubId → hub.id' as violation_type, o.id as record_id, o.hubId as foreign_key_value
FROM organisation o 
LEFT JOIN hub h ON o.hubId = h.id 
WHERE o.hubId IS NOT NULL AND h.id IS NULL

UNION ALL

SELECT 'organisation.publisherId → user.id' as violation_type, o.id as record_id, o.publisherId as foreign_key_value
FROM organisation o 
LEFT JOIN user u ON o.publisherId = u.id 
WHERE o.publisherId IS NOT NULL AND u.id IS NULL

UNION ALL

-- project FK checks
SELECT 'project.organisationId → organisation.id' as violation_type, p.id as record_id, p.organisationId as foreign_key_value
FROM project p 
LEFT JOIN organisation o ON p.organisationId = o.id 
WHERE p.organisationId IS NOT NULL AND o.id IS NULL

UNION ALL

SELECT 'project.imageId → image.id' as violation_type, p.id as record_id, p.imageId as foreign_key_value
FROM project p 
LEFT JOIN image i ON p.imageId = i.id 
WHERE p.imageId IS NOT NULL AND i.id IS NULL

UNION ALL

SELECT 'project.publisherId → user.id' as violation_type, p.id as record_id, p.publisherId as foreign_key_value
FROM project p 
LEFT JOIN user u ON p.publisherId = u.id 
WHERE p.publisherId IS NOT NULL AND u.id IS NULL

UNION ALL

-- layer FK checks
SELECT 'layer.organisationId → organisation.id' as violation_type, l.id as record_id, l.organisationId as foreign_key_value
FROM layer l 
LEFT JOIN organisation o ON l.organisationId = o.id 
WHERE l.organisationId IS NOT NULL AND o.id IS NULL

UNION ALL

SELECT 'layer.projectId → project.id' as violation_type, l.id as record_id, l.projectId as foreign_key_value
FROM layer l 
LEFT JOIN project p ON l.projectId = p.id 
WHERE l.projectId IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 'layer.publisherId → user.id' as violation_type, l.id as record_id, l.publisherId as foreign_key_value
FROM layer l 
LEFT JOIN user u ON l.publisherId = u.id 
WHERE l.publisherId IS NOT NULL AND u.id IS NULL

UNION ALL

-- feature FK checks
SELECT 'feature.organisationId → organisation.id' as violation_type, f.id as record_id, f.organisationId as foreign_key_value
FROM feature f 
LEFT JOIN organisation o ON f.organisationId = o.id 
WHERE f.organisationId IS NOT NULL AND o.id IS NULL

UNION ALL

SELECT 'feature.projectId → project.id' as violation_type, f.id as record_id, f.projectId as foreign_key_value
FROM feature f 
LEFT JOIN project p ON f.projectId = p.id 
WHERE f.projectId IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 'feature.layerId → layer.id' as violation_type, f.id as record_id, f.layerId as foreign_key_value
FROM feature f 
LEFT JOIN layer l ON f.layerId = l.id 
WHERE f.layerId IS NOT NULL AND l.id IS NULL

UNION ALL

SELECT 'feature.contributorId → user.id' as violation_type, f.id as record_id, f.contributorId as foreign_key_value
FROM feature f 
LEFT JOIN user u ON f.contributorId = u.id 
WHERE f.contributorId IS NOT NULL AND u.id IS NULL

UNION ALL

SELECT 'feature.publisherId → user.id' as violation_type, f.id as record_id, f.publisherId as foreign_key_value
FROM feature f 
LEFT JOIN user u ON f.publisherId = u.id 
WHERE f.publisherId IS NOT NULL AND u.id IS NULL

UNION ALL

-- featureProperty FK checks
SELECT 'featureProperty.featureId → feature.id' as violation_type, 
       fp.featureId || ',' || fp.propertyId as record_id, 
       fp.featureId as foreign_key_value
FROM featureProperty fp 
LEFT JOIN feature f ON fp.featureId = f.id 
WHERE fp.featureId IS NOT NULL AND f.id IS NULL

UNION ALL

SELECT 'featureProperty.propertyId → property.id' as violation_type, 
       fp.featureId || ',' || fp.propertyId as record_id, 
       fp.propertyId as foreign_key_value
FROM featureProperty fp 
LEFT JOIN property p ON fp.propertyId = p.id 
WHERE fp.propertyId IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 'featureProperty.propertyValueId → propertyValue.id' as violation_type, 
       fp.featureId || ',' || fp.propertyId as record_id, 
       fp.propertyValueId as foreign_key_value
FROM featureProperty fp 
LEFT JOIN propertyValue pv ON fp.propertyValueId = pv.id 
WHERE fp.propertyValueId IS NOT NULL AND pv.id IS NULL

UNION ALL

-- property FK checks
SELECT 'property.projectId → project.id' as violation_type, prop.id as record_id, prop.projectId as foreign_key_value
FROM property prop 
LEFT JOIN project p ON prop.projectId = p.id 
WHERE prop.projectId IS NOT NULL AND p.id IS NULL

UNION ALL

-- propertyValue FK checks
SELECT 'propertyValue.propertyId → property.id' as violation_type, pv.id as record_id, pv.propertyId as foreign_key_value
FROM propertyValue pv 
LEFT JOIN property p ON pv.propertyId = p.id 
WHERE pv.propertyId IS NOT NULL AND p.id IS NULL

UNION ALL

-- layerProperty FK checks
SELECT 'layerProperty.layerId → layer.id' as violation_type, 
       lp.layerId || ',' || lp.propertyId as record_id, 
       lp.layerId as foreign_key_value
FROM layerProperty lp 
LEFT JOIN layer l ON lp.layerId = l.id 
WHERE lp.layerId IS NOT NULL AND l.id IS NULL

UNION ALL

SELECT 'layerProperty.propertyId → property.id' as violation_type, 
       lp.layerId || ',' || lp.propertyId as record_id, 
       lp.propertyId as foreign_key_value
FROM layerProperty lp 
LEFT JOIN property p ON lp.propertyId = p.id 
WHERE lp.propertyId IS NOT NULL AND p.id IS NULL

UNION ALL

-- organisationRole FK checks
SELECT 'organisationRole.organisationId → organisation.id' as violation_type, 
       orole.organisationId || ',' || orole.userId as record_id, 
       orole.organisationId as foreign_key_value
FROM organisationRole orole 
LEFT JOIN organisation o ON orole.organisationId = o.id 
WHERE orole.organisationId IS NOT NULL AND o.id IS NULL

UNION ALL

SELECT 'organisationRole.userId → user.id' as violation_type, 
       orole.organisationId || ',' || orole.userId as record_id, 
       orole.userId as foreign_key_value
FROM organisationRole orole 
LEFT JOIN user u ON orole.userId = u.id 
WHERE orole.userId IS NOT NULL AND u.id IS NULL

UNION ALL

-- projectRole FK checks
SELECT 'projectRole.projectId → project.id' as violation_type, 
       prole.projectId || ',' || prole.userId as record_id, 
       prole.projectId as foreign_key_value
FROM projectRole prole 
LEFT JOIN project p ON prole.projectId = p.id 
WHERE prole.projectId IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 'projectRole.userId → user.id' as violation_type, 
       prole.projectId || ',' || prole.userId as record_id, 
       prole.userId as foreign_key_value
FROM projectRole prole 
LEFT JOIN user u ON prole.userId = u.id 
WHERE prole.userId IS NOT NULL AND u.id IS NULL

UNION ALL

-- userFeature FK checks
SELECT 'userFeature.userId → user.id' as violation_type, 
       uf.userId || ',' || uf.featureId as record_id, 
       uf.userId as foreign_key_value
FROM userFeature uf 
LEFT JOIN user u ON uf.userId = u.id 
WHERE uf.userId IS NOT NULL AND u.id IS NULL

UNION ALL

SELECT 'userFeature.featureId → feature.id' as violation_type, 
       uf.userId || ',' || uf.featureId as record_id, 
       uf.featureId as foreign_key_value
FROM userFeature uf 
LEFT JOIN feature f ON uf.featureId = f.id 
WHERE uf.featureId IS NOT NULL AND f.id IS NULL

UNION ALL

-- userLayer FK checks
SELECT 'userLayer.userId → user.id' as violation_type, 
       ul.userId || ',' || ul.layerId as record_id, 
       ul.userId as foreign_key_value
FROM userLayer ul 
LEFT JOIN user u ON ul.userId = u.id 
WHERE ul.userId IS NOT NULL AND u.id IS NULL

UNION ALL

SELECT 'userLayer.layerId → layer.id' as violation_type, 
       ul.userId || ',' || ul.layerId as record_id, 
       ul.layerId as foreign_key_value
FROM userLayer ul 
LEFT JOIN layer l ON ul.layerId = l.id 
WHERE ul.layerId IS NOT NULL AND l.id IS NULL

ORDER BY violation_type, record_id; 