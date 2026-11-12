-- Refs #178. A property has exactly one translated label/placeholder row per locale.
-- Fail on conflicting input rather than silently discarding authored translations.
CREATE UNIQUE INDEX property_i18n_identity ON propertyI18n(propertyId,locale);
