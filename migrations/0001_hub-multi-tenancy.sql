CREATE TABLE `hub` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`domain` text NOT NULL,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hub_code_unique` ON `hub` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `hub_domain_unique` ON `hub` (`domain`);--> statement-breakpoint
ALTER TABLE `organisation` ADD `hubId` text REFERENCES hub(id);--> statement-breakpoint
ALTER TABLE `organisation` ADD `isHubExclusive` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organisation` ADD `isCoreIncluded` integer DEFAULT true NOT NULL;--> statement-breakpoint
INSERT INTO `hub` (`id`, `code`, `domain`, `isArchived`, `createdAt`, `modifiedAt`) VALUES ('4Jsk5LngvFZq', 'hkghostsigns', 'hkghostsigns.com', false, '2025-01-01T00:00:00.000Z', '2024-05-01T00:00:00.000Z');
