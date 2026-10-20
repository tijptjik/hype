-- Rename the persisted style while preserving project references and layer metadata.
INSERT INTO cardStyle (code) VALUES ('flexible');
UPDATE project SET cardStyleCode = 'flexible' WHERE cardStyleCode = 'conditional';
UPDATE layer
SET metadata = json_set(metadata, '$.cardStyleCode', 'flexible')
WHERE json_extract(metadata, '$.cardStyleCode') = 'conditional';
DELETE FROM cardStyle WHERE code = 'conditional';
