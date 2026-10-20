-- Correct editions which already received the ELN content import.
-- These exact generated fields are no longer part of the ELN property catalogue.
PRAGMA foreign_keys=ON;
DELETE FROM property
WHERE projectId='vGBvWfSZNELM'
  AND ((id='eln_sources' AND key='sources')
    OR (id='eln_publisher' AND key='publisher')
    OR (id='eln_translator' AND key='translator'));

-- Retain ISBN values for internal reference, without public display or editing.
UPDATE property SET isUserContributable=0,isDefaultEnabled=0
WHERE id='eln_isbn' AND projectId='vGBvWfSZNELM' AND key='isbn';
UPDATE projectProperty SET isDefaultEnabled=0
WHERE projectId='vGBvWfSZNELM' AND propertyId='eln_isbn';
UPDATE layerProperty SET isVisible=0,isUserContributable=0
WHERE propertyId='eln_isbn'
  AND layerId IN (SELECT id FROM layer WHERE projectId='vGBvWfSZNELM');

-- Keep the edition detail in the value rather than a multi-line field label.
UPDATE propertyI18n SET label='Published'
WHERE propertyId='eln_publicationDate' AND locale='en'
  AND label='Publication date (cover edition)';
