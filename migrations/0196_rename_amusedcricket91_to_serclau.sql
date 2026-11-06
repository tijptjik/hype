-- Rename the requested account while preserving any subsequent username change.
-- Keep the login and display usernames aligned; existing uniqueness guards reject conflicts.
UPDATE user
SET username = 'serclau',
    displayUsername = 'serclau',
    updatedAt = CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)
WHERE id = 'iRgLi3RYOhIYgtM1jyGcZ2U5rGNrKeGa'
  AND lower(username) = 'amusedcricket91';
