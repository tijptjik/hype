-- Custom SQL migration file, put your code below! --
UPDATE "organisation"
SET
  "capabilities" = json(
    '{
      "manageBakeries": {
        "i18n": {
          "en": "Donor Manager",
          "zhHans": "管理面包店仪表板",
          "zhHant": "管理麵包店儀表板"
        }
      },
      "manageVolunteers": {
        "i18n": {
          "en": "Event Manager",
          "zhHans": "管理志愿者仪表板",
          "zhHant": "管理志願者儀表板"
        }
      },
      "manageDropOffs": {
        "i18n": {
          "en": "Dropoff Point Manager",
          "zhHans": "管理投放点仪表板",
          "zhHant": "管理投放點儀表板"
        }
      }
    }'
  ),
  "modifiedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE lower("code") = 'hkfoodworks';
