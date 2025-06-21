-- Custom SQL migration file, put your code below! --

-- ═══════════════════════════════════════════════════════════════════════════════════
-- SEED CONTRIBUTOR IDS
-- ═══════════════════════════════════════════════════════════════════════════════════
-- Sets contributor IDs for all images and features with specific contributor assignments

-- Set all image contributorIds to 'Iw4bEjVLxo35P3I75T9JtdYlBShZQVgs'
UPDATE image 
SET contributorId = 'Iw4bEjVLxo35P3I75T9JtdYlBShZQVgs';

-- Set feature contributorIds based on row number (even/odd)
-- Even rows: 'Iw4bEjVLxo35P3I75T9JtdYlBShZQVgs'
-- Odd rows: 'QQrveSvG10G2'
WITH numbered_features AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY id) as row_num
  FROM feature
)
UPDATE feature 
SET contributorId = CASE 
  WHEN (SELECT row_num FROM numbered_features WHERE numbered_features.id = feature.id) % 2 = 0 
    THEN 'Iw4bEjVLxo35P3I75T9JtdYlBShZQVgs'
  ELSE 'QQrveSvG10G2'
END;