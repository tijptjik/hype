-- Missing flags inherit enabled defaults. Preserve explicit existing preferences.
-- These two editorial projects opt out of automatic first-image classification.
UPDATE project SET flags = json_set(flags,
  '$.autoPublishClassifiedImages', json(CASE WHEN json_extract(flags, '$.autoPublishClassifiedImages') = 0 THEN 'false' ELSE 'true' END),
  '$.autoFeatureFirstImage', json(CASE
    WHEN json_extract(flags, '$.autoFeatureFirstImage') IS NOT NULL
      THEN CASE WHEN json_extract(flags, '$.autoFeatureFirstImage') = 0 THEN 'false' ELSE 'true' END
    WHEN lower(code) IN ('hkghostsigns', 'ghostsigns', 'independentbookstores') THEN 'false'
    ELSE 'true' END));
