-- Refs #199. Select the dedicated card and non-photo marker renderer only for
-- the Breadline project. No donor, run, image, or other project data is modified.
INSERT INTO cardStyle (code) VALUES ('breadline') ON CONFLICT(code) DO NOTHING;
UPDATE project SET cardStyleCode='breadline', markerStyleCode='breadline'
WHERE code='breadline'
  AND organisationId IN (SELECT id FROM organisation WHERE code='hkfoodworks');
