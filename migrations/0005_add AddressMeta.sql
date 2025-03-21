PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_feature` (
	`id` text PRIMARY KEY NOT NULL,
	`geometry` text NOT NULL,
	`title` text NOT NULL,
	`titleGen` integer DEFAULT false NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT false NOT NULL,
	`displayAddress` text,
	`displayAddressGen` integer DEFAULT false NOT NULL,
	`addressProperties` text DEFAULT '{}',
	`addressMeta` text DEFAULT '{}',
	`layerId` text NOT NULL,
	`contributorId` text,
	`publisherId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`isPendingReview` integer DEFAULT false NOT NULL,
	`isArchived` integer DEFAULT false NOT NULL,
	`isIntangible` integer DEFAULT false NOT NULL,
	`isVisitable` integer DEFAULT true NOT NULL,
	`visitableAsOf` text DEFAULT (CURRENT_DATE),
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`publishedAt` text,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feature`("id", "geometry", "title", "titleGen", "description", "descriptionGen", "displayAddress", "displayAddressGen", "addressProperties", "addressMeta", "layerId", "contributorId", "publisherId", "isPublished", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt", "publishedAt") SELECT "id", "geometry", "title", "titleGen", "description", "descriptionGen", "displayAddress", "displayAddressGen", "addressProperties", "addressMeta", "layerId", "contributorId", "publisherId", "isPublished", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt", "publishedAt" FROM `feature`;--> statement-breakpoint
DROP TABLE `feature`;--> statement-breakpoint
ALTER TABLE `__new_feature` RENAME TO `feature`;--> statement-breakpoint
PRAGMA foreign_keys=ON;