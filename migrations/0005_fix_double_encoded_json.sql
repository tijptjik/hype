-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix Double-Encoded JSON Fields
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- ISSUE: User preferences and experimental fields were double-encoded as JSON.
-- CAUSE: A conflict between client-side JSON serialization and Drizzle's `mode:'json'`.
-- FIX: This migration identifies double-encoded strings by checking their JSON type
--      and unwraps one layer of encoding.
-- 
-- BEFORE: "{\"fallbackLocales\":[], \"allowMachineTranslation\":false}"
-- AFTER:  {"fallbackLocales":[], "allowMachineTranslation":false}
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fix double-encoded preferences field
-- This finds fields that are JSON strings ('text') containing valid JSON,
-- and unwraps them one level.
UPDATE user 
SET preferences = json_extract(preferences, '$')
WHERE json_type(preferences) = 'text' AND json_valid(json_extract(preferences, '$')) = 1;

-- Fix double-encoded experimental field
UPDATE user 
SET experimental = json_extract(experimental, '$')
WHERE json_type(experimental) = 'text' AND json_valid(json_extract(experimental, '$')) = 1;

-- Report results
SELECT 
  'Double-encoded fields fixed' as message; 