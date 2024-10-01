CREATE TABLE `layerI18n` (
	`layerId` text NOT NULL,
	`lang` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text NOT NULL,
	`description` text,
	PRIMARY KEY(`layerId`, `lang`),
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE cascade
);
