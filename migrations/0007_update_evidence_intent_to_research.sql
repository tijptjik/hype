-- Migration: Update featureImage intent from 'evidence' to 'research'
-- This migration updates all featureImage records that have intent = 'evidence' to intent = 'research'
-- as the enum value has changed in the codebase.

UPDATE featureImage 
SET intent = 'research' 
WHERE intent = 'evidence'; 