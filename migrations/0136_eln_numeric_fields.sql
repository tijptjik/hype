-- Use single-line numeric inputs for ELN ISBNs and publication years.
-- Full researched publication dates remain in scripts/eln/data/backfill.json.
UPDATE property SET component='InputField',dataType='number'
WHERE projectId='vGBvWfSZNELM' AND type='specifier'
  AND ((id='eln_isbn' AND key='isbn')
    OR (id='eln_publicationDate' AND key='publicationDate'));

-- Convert only recognised ISO dates; preserve empty and other editorial values.
UPDATE featureProperty SET value=substr(value,1,4)
WHERE propertyId IN (
  SELECT id FROM property
  WHERE id='eln_publicationDate' AND key='publicationDate'
    AND projectId='vGBvWfSZNELM'
)
AND value GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

-- Publication years use the numeric text-field contract, bounded to four digits.
UPDATE property SET min=1000,max=9999
WHERE id='eln_publicationDate' AND key='publicationDate'
  AND projectId='vGBvWfSZNELM';
