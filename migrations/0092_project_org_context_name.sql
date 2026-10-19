-- Organisation-context labels are independent of the project's standalone short name.
ALTER TABLE project ADD COLUMN useAllInOrgContext integer NOT NULL DEFAULT false;

-- Enable the replacement only for the existing Hong Kong Ghost Signs project.
UPDATE project
SET useAllInOrgContext = true,
    modifiedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'YuSFnia9VOtG' AND code = 'hkghostsigns';

-- Restore the standalone English label without overwriting other curated translations.
UPDATE projectI18n
SET nameShort = name
WHERE projectId IN (
  SELECT id FROM project WHERE id = 'YuSFnia9VOtG' AND code = 'hkghostsigns'
)
AND locale = 'en' AND nameShort = 'All';
