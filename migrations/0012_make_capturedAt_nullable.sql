PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_image` (
	`id` text PRIMARY KEY NOT NULL,
	`contributorId` text,
	`cdn` text DEFAULT 'cloudinary' NOT NULL,
	`env` text DEFAULT 'dg6vtsga1' NOT NULL,
	`cdnId` text,
	`publicId` text NOT NULL,
	`version` integer,
	`originalFilename` text,
	`originalExtension` text,
	`originalWidth` integer,
	`originalHeight` integer,
	`metadata` text,
	`cameraModel` text,
	`capturedAt` text,
	`latitude` text,
	`longitude` text,
	`credit` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_image`("id", "contributorId", "cdn", "env", "cdnId", "publicId", "version", "originalFilename", "originalExtension", "originalWidth", "originalHeight", "metadata", "cameraModel", "capturedAt", "latitude", "longitude", "credit", "isArchived", "createdAt", "modifiedAt") SELECT "id", "contributorId", "cdn", "env", "cdnId", "publicId", "version", "originalFilename", "originalExtension", "originalWidth", "originalHeight", "metadata", "cameraModel", "capturedAt", "latitude", "longitude", "credit", "isArchived", "createdAt", "modifiedAt" FROM `image`;--> statement-breakpoint
DROP TABLE `image`;--> statement-breakpoint
ALTER TABLE `__new_image` RENAME TO `image`;--> statement-breakpoint
PRAGMA foreign_keys=ON;