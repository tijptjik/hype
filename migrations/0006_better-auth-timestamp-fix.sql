PRAGMA foreign_keys=OFF;

-- Convert account table timestamps
CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`idToken` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `__new_account`(
  "id", "userId", "accountId", "providerId", "accessToken", "refreshToken", 
  "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "idToken", "password", 
  "createdAt", "updatedAt"
) 
SELECT 
  "id", "userId", "accountId", "providerId", "accessToken", "refreshToken", 
  "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "idToken", "password",
  -- Convert ISO string to milliseconds
  CAST((julianday("createdAt") - 2440587.5) * 86400000 AS INTEGER) as "createdAt",
  CAST((julianday("updatedAt") - 2440587.5) * 86400000 AS INTEGER) as "updatedAt"
FROM `account`;

DROP TABLE `account`;
ALTER TABLE `__new_account` RENAME TO `account`;

-- Convert session table timestamps
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `__new_session`(
  "id", "userId", "token", "expiresAt", "ipAddress", "userAgent", 
  "createdAt", "updatedAt"
) 
SELECT 
  "id", "userId", "token", "expiresAt", "ipAddress", "userAgent",
  -- Convert ISO string to milliseconds  
  CAST((julianday("createdAt") - 2440587.5) * 86400000 AS INTEGER) as "createdAt",
  CAST((julianday("updatedAt") - 2440587.5) * 86400000 AS INTEGER) as "updatedAt"
FROM `session`;

DROP TABLE `session`;
ALTER TABLE `__new_session` RENAME TO `session`;

-- Convert user table timestamps
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer DEFAULT false,
	`image` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`attribution` text,
	`isArchived` integer DEFAULT false NOT NULL,
	`preferences` text DEFAULT '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}' NOT NULL,
	`experimental` text DEFAULT '{"contributorMode":false, "noLabelsMode":false}' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);

INSERT INTO `__new_user`(
  "id", "name", "email", "emailVerified", "image", "locale", 
  "attribution", "isArchived", "preferences", "experimental", 
  "createdAt", "updatedAt"
) 
SELECT 
  "id", "name", "email", "emailVerified", "image", "locale", 
  "attribution", "isArchived", "preferences", "experimental",
  -- Convert ISO string to milliseconds
  CAST((julianday("createdAt") - 2440587.5) * 86400000 AS INTEGER) as "createdAt",
  CAST((julianday("updatedAt") - 2440587.5) * 86400000 AS INTEGER) as "updatedAt"
FROM `user`;

DROP TABLE `user`;
ALTER TABLE `__new_user` RENAME TO `user`;
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

-- Convert verification table timestamps  
CREATE TABLE `__new_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);

INSERT INTO `__new_verification`(
  "id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"
) 
SELECT 
  "id", "identifier", "value", "expiresAt",
  -- Convert ISO string to milliseconds
  CAST((julianday("createdAt") - 2440587.5) * 86400000 AS INTEGER) as "createdAt",
  CAST((julianday("updatedAt") - 2440587.5) * 86400000 AS INTEGER) as "updatedAt"
FROM `verification`;

DROP TABLE `verification`;
ALTER TABLE `__new_verification` RENAME TO `verification`;

PRAGMA foreign_keys=ON;