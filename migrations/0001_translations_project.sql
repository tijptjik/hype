CREATE TABLE `projectI18n` (
	`projectId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	`license` text,
	`attribution` text,
	PRIMARY KEY(`projectId`, `lang`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE cascade
);
