CREATE TABLE `taskImage` (
	`taskId` text NOT NULL,
	`imageId` text NOT NULL,
	PRIMARY KEY(`taskId`, `imageId`),
	FOREIGN KEY (`taskId`) REFERENCES `task`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`imageId`) REFERENCES `image`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task` (
	`id` text PRIMARY KEY NOT NULL,
	`organisationId` text NOT NULL,
	`projectId` text NOT NULL,
	`featureId` text NOT NULL,
	`contributorId` text NOT NULL,
	`reviewerId` text,
	`type` text NOT NULL,
	`isReviewed` integer DEFAULT false NOT NULL,
	`reviewOutcome` text,
	`reviewAction` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organisationId`) REFERENCES `organisation`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`contributorId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_task`("id", "organisationId", "projectId", "featureId", "contributorId", "reviewerId", "type", "isReviewed", "reviewOutcome", "reviewAction", "createdAt", "modifiedAt") SELECT "id", "organisationId", "projectId", "featureId", "contributorId", "reviewerId", "type", "isReviewed", "reviewOutcome", "reviewAction", "createdAt", "modifiedAt" FROM `task`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
ALTER TABLE `__new_task` RENAME TO `task`;--> statement-breakpoint
PRAGMA foreign_keys=ON;