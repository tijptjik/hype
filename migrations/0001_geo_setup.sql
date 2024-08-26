CREATE TABLE `geoCollection` (
	`id` text PRIMARY KEY NOT NULL,
	`geometry` text,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `geoFeature` (
	`id` text PRIMARY KEY NOT NULL,
	`geometry` text NOT NULL,
	`properties` text NOT NULL,
	`geoCollectionId` text NOT NULL,
	`contributorId` text,
	`publisherId` text,
	`isPublished` integer DEFAULT false,
	`lastSeen` text DEFAULT (CURRENT_DATE),
	FOREIGN KEY (`geoCollectionId`) REFERENCES `geoCollection`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publisherId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `geoProject` (
	`id` text PRIMARY KEY NOT NULL,
	`metadata` text,
	`maintainerId` text,
	FOREIGN KEY (`maintainerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
