DROP INDEX IF EXISTS "user_displayUsername_unique";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "displayUsername";
