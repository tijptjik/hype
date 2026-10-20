-- Keep ELN editions in reverse chronological order in the default modifiedAt-desc list.
-- These are deliberate presentation timestamps, not historical audit dates.
-- rank also preserves the same order in project settings and map-render consumers.
CREATE TABLE _eln_order_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _eln_order_guard
SELECT count(*)=4 FROM layer WHERE projectId='vGBvWfSZNELM'
AND id IN ('zJJawV9ay56p','vli8hfmD-XEZ','0bf1RYWdpaAt','lvWu_dCwiVZt');
UPDATE layer SET rank=0, createdAt='2026-10-20T00:00:03.000Z', modifiedAt='2026-10-20T00:00:03.000Z'
WHERE id='zJJawV9ay56p' AND projectId='vGBvWfSZNELM';
UPDATE layer SET rank=1, createdAt='2026-10-20T00:00:02.000Z', modifiedAt='2026-10-20T00:00:02.000Z'
WHERE id='vli8hfmD-XEZ' AND projectId='vGBvWfSZNELM';
UPDATE layer SET rank=2, createdAt='2026-10-20T00:00:01.000Z', modifiedAt='2026-10-20T00:00:01.000Z'
WHERE id='0bf1RYWdpaAt' AND projectId='vGBvWfSZNELM';
UPDATE layer SET rank=3, createdAt='2026-10-20T00:00:00.000Z', modifiedAt='2026-10-20T00:00:00.000Z'
WHERE id='lvWu_dCwiVZt' AND projectId='vGBvWfSZNELM';
DROP TABLE _eln_order_guard;
