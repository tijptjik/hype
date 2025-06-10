PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_feature` (
	`id` text PRIMARY KEY NOT NULL,
	`geometry` text NOT NULL,
	`addressMeta` text DEFAULT '{}',
	`layerId` text NOT NULL,
	`contributorId` text,
	`isPublished` integer DEFAULT false NOT NULL,
	`publisherId` text,
	`publishedAt` text,
	`isPendingReview` integer DEFAULT false NOT NULL,
	`isArchived` integer DEFAULT false NOT NULL,
	`isIntangible` integer DEFAULT false NOT NULL,
	`isVisitable` integer DEFAULT true NOT NULL,
	`visitableAsOf` text DEFAULT (CURRENT_DATE),
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feature`("id", "geometry", "addressMeta", "layerId", "contributorId", "isPublished", "publisherId", "publishedAt", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt") SELECT "id", "geometry", "addressMeta", "layerId", "contributorId", "isPublished", "publisherId", "publishedAt", "isPendingReview", "isArchived", "isIntangible", "isVisitable", "visitableAsOf", "createdAt", "modifiedAt" FROM `feature`;--> statement-breakpoint
DROP TABLE `feature`;--> statement-breakpoint
ALTER TABLE `__new_feature` RENAME TO `feature`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `featureImage` ADD `publisherId` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `layerProperty` ADD `isUserContributed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `property` ADD `isUserContributed` integer DEFAULT true NOT NULL;