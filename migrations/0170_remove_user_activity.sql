-- Product usage is recorded in Cloudflare Analytics Engine.
-- Export any required legacy login counters before applying this migration.
DROP TABLE IF EXISTS `userActivity`;
