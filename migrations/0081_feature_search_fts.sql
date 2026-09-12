-- Upgrade databases that applied the original row-per-gram 0079 migration.
DROP TRIGGER IF EXISTS feature_search_i18n_insert;
DROP TRIGGER IF EXISTS feature_search_i18n_delete;
DROP TRIGGER IF EXISTS feature_search_i18n_update;
DROP TABLE IF EXISTS featureSearchGram;

-- Explicit integer identities survive VACUUM and translation/feature key changes.
-- Both foreign keys are needed because some legacy featureI18n tables lack a feature FK.
CREATE TABLE featureSearchDocument (
  id INTEGER PRIMARY KEY,
  featureId TEXT NOT NULL REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale TEXT NOT NULL,
  UNIQUE (featureId, locale),
  FOREIGN KEY (featureId, locale) REFERENCES featureI18n(featureId, locale)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- One FTS document replaces thousands of separately billed relational gram rows.
-- Contentless-delete retains no duplicate text and supports normal DELETE/REPLACE.
CREATE VIRTUAL TABLE featureSearchFts USING fts5(
  grams,
  content = '',
  contentless_delete = 1,
  detail = none
);

-- One-, two- and three-codepoint tokens preserve literal substrings, including CJK
-- and punctuation. Hex encoding prevents FTS tokenization from changing a gram.
-- The view is evaluated only when indexing; exact source text verifies candidates.
CREATE VIEW featureSearchContent AS
SELECT document.id, document.featureId, document.locale,
  (
    WITH RECURSIVE
      fields(content) AS (
        SELECT lower(translation.title)
        UNION ALL SELECT lower(translation.description)
        UNION ALL SELECT lower(translation.displayAddress)
      ),
      positions(position) AS (
        SELECT 1
        UNION ALL SELECT position + 1 FROM positions
        WHERE position < (SELECT coalesce(max(length(content)), 0) FROM fields)
      ),
      sizes(size) AS (VALUES(1),(2),(3))
    SELECT coalesce(group_concat(token, ' '), '')
    FROM (
      SELECT DISTINCT hex(substr(content, position, size)) AS token
      FROM fields CROSS JOIN positions CROSS JOIN sizes
      WHERE position + size - 1 <= length(content)
    )
  ) AS grams
FROM featureSearchDocument AS document
JOIN featureI18n AS translation
  ON translation.featureId = document.featureId AND translation.locale = document.locale;

-- Cascades remove FTS documents even when source DELETE triggers are skipped by REPLACE.
CREATE TRIGGER feature_search_document_delete AFTER DELETE ON featureSearchDocument BEGIN
  DELETE FROM featureSearchFts WHERE rowid = OLD.id;
END;

CREATE TRIGGER feature_search_i18n_insert AFTER INSERT ON featureI18n
WHEN EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId) BEGIN
  INSERT INTO featureSearchDocument(featureId, locale) VALUES(NEW.featureId, NEW.locale)
  ON CONFLICT(featureId, locale) DO NOTHING;
  INSERT OR REPLACE INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;

-- Metadata writes and no-op text updates do not regenerate or rewrite the FTS index.
CREATE TRIGGER feature_search_i18n_update
AFTER UPDATE OF title, description, displayAddress ON featureI18n
WHEN NEW.title IS NOT OLD.title OR NEW.description IS NOT OLD.description
  OR NEW.displayAddress IS NOT OLD.displayAddress BEGIN
  INSERT OR REPLACE INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;

-- An excluded legacy orphan becomes searchable when its owner is repaired.
-- Existing mappings follow identity cascades without regenerating their documents.
CREATE TRIGGER feature_search_i18n_identity_update
AFTER UPDATE OF featureId, locale ON featureI18n
WHEN (NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale)
  AND EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId)
  AND NOT EXISTS (
    SELECT 1 FROM featureSearchDocument WHERE featureId = NEW.featureId AND locale = NEW.locale
  ) BEGIN
  INSERT INTO featureSearchDocument(featureId, locale) VALUES(NEW.featureId, NEW.locale);
  INSERT INTO featureSearchFts(rowid, grams)
  SELECT id, grams FROM featureSearchContent
  WHERE featureId = NEW.featureId AND locale = NEW.locale;
END;

-- Neighbourhood maintenance is independent from search text. The explicit delete
-- handles INSERT OR REPLACE changing an English translation to an empty value.
CREATE TRIGGER feature_neighbourhood_i18n_insert AFTER INSERT ON featureI18n
WHEN NEW.locale = 'en' AND EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId) BEGIN
  DELETE FROM featureNeighbourhood WHERE featureId = NEW.featureId
    AND nullif(json_extract(NEW.addressProperties, '$.neighbourhood'), '') IS NULL;
  INSERT INTO featureNeighbourhood(featureId, neighbourhood)
  SELECT NEW.featureId, json_extract(NEW.addressProperties, '$.neighbourhood')
  WHERE nullif(json_extract(NEW.addressProperties, '$.neighbourhood'), '') IS NOT NULL
  ON CONFLICT(featureId) DO UPDATE SET neighbourhood = excluded.neighbourhood
  WHERE featureNeighbourhood.neighbourhood IS NOT excluded.neighbourhood;
END;

CREATE TRIGGER feature_neighbourhood_i18n_delete AFTER DELETE ON featureI18n
WHEN OLD.locale = 'en' BEGIN
  DELETE FROM featureNeighbourhood WHERE featureId = OLD.featureId;
END;

CREATE TRIGGER feature_neighbourhood_i18n_update
AFTER UPDATE OF featureId, locale, addressProperties ON featureI18n
WHEN (OLD.locale = 'en' OR NEW.locale = 'en') AND (
  NEW.featureId IS NOT OLD.featureId OR NEW.locale IS NOT OLD.locale OR
  nullif(json_extract(NEW.addressProperties, '$.neighbourhood'), '')
    IS NOT nullif(json_extract(OLD.addressProperties, '$.neighbourhood'), '')
) BEGIN
  DELETE FROM featureNeighbourhood WHERE featureId = OLD.featureId AND OLD.locale = 'en'
    AND (NEW.featureId IS NOT OLD.featureId OR NEW.locale != 'en'
      OR nullif(json_extract(NEW.addressProperties, '$.neighbourhood'), '') IS NULL);
  INSERT INTO featureNeighbourhood(featureId, neighbourhood)
  SELECT NEW.featureId, json_extract(NEW.addressProperties, '$.neighbourhood')
  WHERE NEW.locale = 'en'
    AND nullif(json_extract(NEW.addressProperties, '$.neighbourhood'), '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM feature WHERE id = NEW.featureId)
  ON CONFLICT(featureId) DO UPDATE SET neighbourhood = excluded.neighbourhood
  WHERE featureNeighbourhood.neighbourhood IS NOT excluded.neighbourhood;
END;

-- Backfill owned translations directly, preserving legacy source orphans unchanged.
INSERT INTO featureSearchDocument(featureId, locale)
SELECT translation.featureId, translation.locale FROM featureI18n AS translation
WHERE EXISTS (SELECT 1 FROM feature WHERE id = translation.featureId);
INSERT INTO featureSearchFts(rowid, grams) SELECT id, grams FROM featureSearchContent;

-- Reconcile existing neighbourhood rows without rewriting unchanged memberships.
DELETE FROM featureNeighbourhood
WHERE NOT EXISTS (
  SELECT 1 FROM featureI18n AS translation
  JOIN feature ON feature.id = translation.featureId
  WHERE translation.featureId = featureNeighbourhood.featureId AND translation.locale = 'en'
    AND nullif(json_extract(translation.addressProperties, '$.neighbourhood'), '') IS NOT NULL
);
INSERT INTO featureNeighbourhood(featureId, neighbourhood)
SELECT translation.featureId, json_extract(translation.addressProperties, '$.neighbourhood')
FROM featureI18n AS translation
JOIN feature ON feature.id = translation.featureId
WHERE translation.locale = 'en'
  AND nullif(json_extract(translation.addressProperties, '$.neighbourhood'), '') IS NOT NULL
ON CONFLICT(featureId) DO UPDATE SET neighbourhood = excluded.neighbourhood
WHERE featureNeighbourhood.neighbourhood IS NOT excluded.neighbourhood;
