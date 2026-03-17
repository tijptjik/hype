UPDATE "layer"
SET "createdAt" = CASE "id"
  WHEN 'vli8hfmD-XEZ' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHEN '0bf1RYWdpaAt' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')
  WHEN 'lvWu_dCwiVZt' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minute')
  ELSE "createdAt"
END
WHERE "id" IN ('vli8hfmD-XEZ', '0bf1RYWdpaAt', 'lvWu_dCwiVZt');
