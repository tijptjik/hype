-- Migration: Assign publisher and contributor to specific user
-- User ID: qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM
-- Purpose: Set publisherId for all published records and contributorId for all contributor records

-- ═══════════════════════
-- UPDATE PUBLISHER IDS
-- ═══════════════════════

-- Update organisation publisherId where isPublished = true
UPDATE organisation 
SET publisherId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE isPublished = 1;

-- Update project publisherId where isPublished = true  
UPDATE project 
SET publisherId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE isPublished = 1;

-- Update layer publisherId where isPublished = true
UPDATE layer 
SET publisherId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE isPublished = 1;

-- Update feature publisherId where isPublished = true
UPDATE feature 
SET publisherId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE isPublished = 1;

-- Update featureImage publisherId where isPublished = true
UPDATE featureImage 
SET publisherId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE isPublished = 1;

-- ═══════════════════════
-- UPDATE CONTRIBUTOR IDS  
-- ═══════════════════════

-- Update feature contributorId for all records that have contributorId field
UPDATE feature 
SET contributorId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE contributorId IS NOT NULL;

-- Update image contributorId for all records that have contributorId field
UPDATE image 
SET contributorId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE contributorId IS NOT NULL;

-- Update task contributorId for all records that have contributorId field  
UPDATE task 
SET contributorId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' 
WHERE contributorId IS NOT NULL; 