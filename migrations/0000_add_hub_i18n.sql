CREATE TABLE `hubI18n` (
	`hubId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameGen` integer DEFAULT true NOT NULL,
	`nameShort` text NOT NULL,
	`nameShortGen` integer DEFAULT true NOT NULL,
	`description` text,
	`descriptionGen` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`hubId`, `locale`),
	FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE cascade
);