CREATE TABLE `hubRole` (
	`hubId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	PRIMARY KEY(`hubId`, `userId`),
	FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projectRole` (
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`capabilities` text DEFAULT '{}',
	PRIMARY KEY(`projectId`, `userId`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projectRole`("projectId", "userId", "role", "capabilities") SELECT "projectId", "userId", "role", "{}" FROM `projectRole`;--> statement-breakpoint
DROP TABLE `projectRole`;--> statement-breakpoint
ALTER TABLE `__new_projectRole` RENAME TO `projectRole`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
