PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hub` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`domain` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_hub`("id", "code", "domain", "isArchived", "createdAt", "modifiedAt") SELECT "id", "code", "domain", "isArchived", "createdAt", "modifiedAt" FROM `hub`;--> statement-breakpoint
DROP TABLE `hub`;--> statement-breakpoint
ALTER TABLE `__new_hub` RENAME TO `hub`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hub_code_unique` ON `hub` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `hub_domain_unique` ON `hub` (`domain`);