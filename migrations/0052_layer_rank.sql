ALTER TABLE "layer" ADD COLUMN "rank" integer DEFAULT 0 NOT NULL;

WITH ranked_layers AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "nextRank"
  FROM "layer"
)
UPDATE "layer"
SET "rank" = (
  SELECT ranked_layers."nextRank"
  FROM ranked_layers
  WHERE ranked_layers."id" = "layer"."id"
);
