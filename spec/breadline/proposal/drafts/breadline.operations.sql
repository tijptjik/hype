-- INACTIVE DRAFT: outside the migration queue; user additions moved to 0085_breadline_users.sql.
-- Refs #180, #194. Schema only; no source data.
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`featureId` text NOT NULL,
	`scheduleId` text,
	`type` text NOT NULL,
	`fromDate` text NOT NULL,
	`untilDate` text NOT NULL,
	`fromTime` text,
	`untilTime` text,
	`timezone` text DEFAULT 'Asia/Hong_Kong' NOT NULL,
	`capacity` integer,
	`atCapacity` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`featureId`) REFERENCES `feature`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`scheduleId`) REFERENCES `schedule`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "event_capacity" CHECK("event"."capacity" IS NULL OR "event"."capacity" > 0),
	CONSTRAINT "event_dates" CHECK("event"."untilDate" >= "event"."fromDate"),
	CONSTRAINT "event_kind" CHECK("event"."type" IN ('pickupWindow','dropoffWindow','programme','programmeSlot'))
);

--> statement-breakpoint
CREATE INDEX `event_feature_date_idx` ON `event` (`featureId`,`fromDate`);
--> statement-breakpoint
CREATE INDEX `event_date_type_idx` ON `event` (`fromDate`,`type`);
--> statement-breakpoint
CREATE TABLE `eventAttendance` (
	`eventId` text NOT NULL,
	`userId` text NOT NULL,
	`hasAttended` integer,
	`rank` integer DEFAULT 0 NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`eventId`, `userId`),
	FOREIGN KEY (`eventId`) REFERENCES `event`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "eventAttendance_attended" CHECK("eventAttendance"."hasAttended" IS NULL OR "eventAttendance"."hasAttended" IN (0,1))
);

--> statement-breakpoint
CREATE INDEX `eventAttendance_user_idx` ON `eventAttendance` (`userId`);
--> statement-breakpoint
CREATE TABLE `eventProperty` (
	`eventId` text NOT NULL,
	`propertyId` text NOT NULL,
	`value` real NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`eventId`, `propertyId`),
	FOREIGN KEY (`eventId`) REFERENCES `event`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE restrict
);

--> statement-breakpoint
CREATE TABLE `eventTravelLeg` (
	`userId` text NOT NULL,
	`fromEventId` text NOT NULL,
	`untilEventId` text NOT NULL,
	`travelMethod` text NOT NULL,
	`distanceMetres` real NOT NULL,
	`durationSeconds` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`userId`, `fromEventId`, `untilEventId`, `travelMethod`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`fromEventId`) REFERENCES `event`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`untilEventId`) REFERENCES `event`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "eventTravelLeg_metrics" CHECK("eventTravelLeg"."distanceMetres" >= 0 AND "eventTravelLeg"."durationSeconds" >= 0)
);

--> statement-breakpoint
CREATE TABLE `leaderboard` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`layerId` text NOT NULL,
	`propertyId` text,
	`resourceType` text NOT NULL,
	`aggregationField` text DEFAULT 'value' NOT NULL,
	`aggregation` text NOT NULL,
	`timeFrame` text,
	`period` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`layerId`) REFERENCES `layer`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`propertyId`) REFERENCES `property`(`id`) ON UPDATE cascade ON DELETE restrict
);

--> statement-breakpoint
CREATE INDEX `leaderboard_project_idx` ON `leaderboard` (`projectId`,`timeFrame`,`period`);
--> statement-breakpoint
CREATE TABLE `leaderboardRanking` (
	`leaderboardId` text NOT NULL,
	`userId` text NOT NULL,
	`value` real NOT NULL,
	`rank` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`leaderboardId`, `userId`),
	FOREIGN KEY (`leaderboardId`) REFERENCES `leaderboard`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "leaderboardRanking_rank" CHECK("leaderboardRanking"."rank" > 0)
);

--> statement-breakpoint
CREATE INDEX `leaderboardRanking_rank_idx` ON `leaderboardRanking` (`leaderboardId`,`rank`);
--> statement-breakpoint
CREATE TABLE `projectDailyParticipation` (
	`projectId` text NOT NULL,
	`date` text NOT NULL,
	`userId` text NOT NULL,
	`status` text DEFAULT 'unconfirmed' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`projectId`, `date`, `userId`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "projectDailyParticipation_status" CHECK("projectDailyParticipation"."status" IN ('unconfirmed','prompted','confirmed','resultShared'))
);

--> statement-breakpoint
CREATE TABLE `projectDailyRole` (
	`projectId` text NOT NULL,
	`date` text NOT NULL,
	`userId` text NOT NULL,
	`role` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`projectId`, `date`, `userId`, `role`),
	FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "projectDailyRole_kind" CHECK("projectDailyRole"."role" IN ('whatsappContact','shopCaller'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `projectDailyRole_whatsapp_idx` ON `projectDailyRole` (`projectId`,`date`) WHERE "projectDailyRole"."role" = 'whatsappContact';
--> statement-breakpoint
CREATE TABLE `schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text NOT NULL,
	`purpose` text DEFAULT 'openingHours' NOT NULL,
	`osmOpeningHours` text,
	`timezone` text DEFAULT 'Asia/Hong_Kong' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "schedule_owner_type" CHECK("schedule"."ownerType" IN ('feature','place'))
);

--> statement-breakpoint
CREATE INDEX `schedule_owner_idx` ON `schedule` (`ownerType`,`ownerId`);
--> statement-breakpoint
CREATE TABLE `scheduleException` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleId` text NOT NULL,
	`exceptionDate` text NOT NULL,
	`exceptionType` text NOT NULL,
	`isClosed` integer DEFAULT false NOT NULL,
	`is24Hours` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scheduleId`) REFERENCES `schedule`(`id`) ON UPDATE cascade ON DELETE restrict
);

--> statement-breakpoint
CREATE UNIQUE INDEX `scheduleException_date_idx` ON `scheduleException` (`scheduleId`,`exceptionDate`);
--> statement-breakpoint
CREATE TABLE `scheduleExceptionI18n` (
	`scheduleExceptionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`scheduleExceptionId`, `locale`),
	FOREIGN KEY (`scheduleExceptionId`) REFERENCES `scheduleException`(`id`) ON UPDATE cascade ON DELETE restrict
);

--> statement-breakpoint
CREATE TABLE `scheduleExceptionTimeSegment` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleExceptionId` text NOT NULL,
	`fromTime` text NOT NULL,
	`untilTime` text NOT NULL,
	`untilDayOffset` integer DEFAULT 0 NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`scheduleExceptionId`) REFERENCES `scheduleException`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "scheduleExceptionTimeSegment_offset" CHECK("scheduleExceptionTimeSegment"."untilDayOffset" IN (0,1))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `scheduleExceptionTimeSegment_rank_idx` ON `scheduleExceptionTimeSegment` (`scheduleExceptionId`,`rank`);
--> statement-breakpoint
CREATE TABLE `scheduleRule` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleId` text NOT NULL,
	`ruleType` text NOT NULL,
	`dayOfWeek` integer,
	`nth` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`validFromDay` integer,
	`validFromMonth` integer,
	`validFromYear` integer,
	`validUntilDay` integer,
	`validUntilMonth` integer,
	`validUntilYear` integer,
	`isClosed` integer DEFAULT false NOT NULL,
	`is24Hours` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scheduleId`) REFERENCES `schedule`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "scheduleRule_kind" CHECK("scheduleRule"."ruleType" IN ('weekly','nthDoWly','publicHoliday')),
	CONSTRAINT "scheduleRule_shape" CHECK(("scheduleRule"."ruleType" = 'publicHoliday' AND "scheduleRule"."dayOfWeek" IS NULL AND "scheduleRule"."nth" IS NULL) OR ("scheduleRule"."ruleType" = 'weekly' AND "scheduleRule"."dayOfWeek" IS NOT NULL AND "scheduleRule"."nth" IS NULL) OR ("scheduleRule"."ruleType" = 'nthDoWly' AND "scheduleRule"."dayOfWeek" IS NOT NULL AND "scheduleRule"."nth" IS NOT NULL)),
	CONSTRAINT "scheduleRule_months" CHECK(("scheduleRule"."validFromMonth" IS NULL OR "scheduleRule"."validFromMonth" BETWEEN 1 AND 12) AND ("scheduleRule"."validUntilMonth" IS NULL OR "scheduleRule"."validUntilMonth" BETWEEN 1 AND 12)),
	CONSTRAINT "scheduleRule_days" CHECK(("scheduleRule"."validFromDay" IS NULL OR "scheduleRule"."validFromDay" BETWEEN 1 AND 31) AND ("scheduleRule"."validUntilDay" IS NULL OR "scheduleRule"."validUntilDay" BETWEEN 1 AND 31)),
	CONSTRAINT "scheduleRule_open_state" CHECK(NOT ("scheduleRule"."isClosed" AND "scheduleRule"."is24Hours")),
	CONSTRAINT "scheduleRule_day" CHECK("scheduleRule"."dayOfWeek" BETWEEN 1 AND 7),
	CONSTRAINT "scheduleRule_nth" CHECK("scheduleRule"."nth" IN (-1,1,2,3,4,5))
);

--> statement-breakpoint
CREATE INDEX `scheduleRule_schedule_idx` ON `scheduleRule` (`scheduleId`);
--> statement-breakpoint
CREATE TABLE `scheduleRuleI18n` (
	`scheduleRuleId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`nameShort` text,
	`nameGen` integer DEFAULT false NOT NULL,
	`nameShortGen` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`scheduleRuleId`, `locale`),
	FOREIGN KEY (`scheduleRuleId`) REFERENCES `scheduleRule`(`id`) ON UPDATE cascade ON DELETE restrict
);

--> statement-breakpoint
CREATE TABLE `scheduleRuleTimeSegment` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleRuleId` text NOT NULL,
	`fromTime` text NOT NULL,
	`untilTime` text NOT NULL,
	`untilDayOffset` integer DEFAULT 0 NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`scheduleRuleId`) REFERENCES `scheduleRule`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "scheduleRuleTimeSegment_offset" CHECK("scheduleRuleTimeSegment"."untilDayOffset" IN (0,1))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `scheduleRuleTimeSegment_rank_idx` ON `scheduleRuleTimeSegment` (`scheduleRuleId`,`rank`);
--> statement-breakpoint
ALTER TABLE `layerProperty` ADD `isEventExclusive` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `property` ADD `isSystemProperty` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `property` ADD `isCalculated` integer DEFAULT false NOT NULL;
