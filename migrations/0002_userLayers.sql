--> statement-breakpoint
CREATE TABLE `userLayer` (
	`layerId` text NOT NULL,
	`userId` text NOT NULL,
	`isVisibleOnLoad` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`layerId`, `userId`),
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `language` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `experimental` text DEFAULT '{"contributorMode":false}' NOT NULL;