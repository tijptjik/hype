-- Refs #189, #194. Runtime first-login claim audit; import auto-claims remain timestamp-free.
ALTER TABLE `breadlineImportUser` ADD `claimedAt` integer;
--> statement-breakpoint
ALTER TABLE `breadlineImportUser` ADD `claimKey` text;
