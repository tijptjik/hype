-- Refs #189, #194. Fresh-database import support; duplicates intentionally fail.
CREATE UNIQUE INDEX `user_telephone_uidx` ON `user` (`telephone`);
--> statement-breakpoint
CREATE TABLE `breadlineImportUser` (
  `userId` text PRIMARY KEY NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `telephone` text NOT NULL UNIQUE,
  `state` text NOT NULL CHECK (`state` IN ('unclaimed', 'claimed')),
  `claimedEmail` text,
  CHECK ((`state` = 'unclaimed' AND `claimedEmail` IS NULL) OR
         (`state` = 'claimed' AND `claimedEmail` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `breadlineImportIdentity` (
  `sourceUserId` integer PRIMARY KEY NOT NULL,
  `sourceVolunteerId` integer,
  `userId` text NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `email` text,
  `name` text,
  `sourceUid` text
);
