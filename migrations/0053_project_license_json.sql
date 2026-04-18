UPDATE "project"
SET "license" = '{"meta":{"allMediaSameRights":true,"attribution":"","isAllRightsReserved":false,"isPublicDomain":false},"media":{"all":{"license":"CC BY-SA / ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false},"image":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"text":{"license":"CC BY-SA","BY":true,"SA":true,"NC":false,"ND":false},"data":{"license":"ODC-ODbL","BY":true,"SA":true,"NC":false,"ND":false}}}'
WHERE "license" IS NULL
   OR TRIM(CAST("license" AS TEXT)) = ''
   OR CAST("license" AS TEXT) = '[object Object]'
   OR json_valid(CAST("license" AS TEXT)) = 0;
