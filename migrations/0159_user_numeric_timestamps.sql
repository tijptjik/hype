-- Repair legacy ISO timestamps once; user date columns store Unix milliseconds.
-- Preserve existing numeric timestamps and skip unparseable text rather than lose data.
UPDATE user
SET createdAt = CASE WHEN typeof(createdAt) = 'text' AND julianday(createdAt) IS NOT NULL
      THEN CAST(ROUND((julianday(createdAt) - 2440587.5) * 86400000) AS INTEGER)
      ELSE createdAt END,
    updatedAt = CASE WHEN typeof(updatedAt) = 'text' AND julianday(updatedAt) IS NOT NULL
      THEN CAST(ROUND((julianday(updatedAt) - 2440587.5) * 86400000) AS INTEGER)
      ELSE updatedAt END
WHERE (typeof(createdAt) = 'text' AND julianday(createdAt) IS NOT NULL)
   OR (typeof(updatedAt) = 'text' AND julianday(updatedAt) IS NOT NULL);
