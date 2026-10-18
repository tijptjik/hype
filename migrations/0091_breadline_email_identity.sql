-- Refs #189, #194. Retain email identities whose source phone is missing or invalid.
CREATE TABLE `breadlineImportUser_next` (
  `userId` text PRIMARY KEY NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `telephone` text UNIQUE,
  `state` text NOT NULL CHECK (`state` IN ('unclaimed', 'claimed')),
  `claimedEmail` text,
  `claimedAt` integer,
  `claimKey` text,
  CHECK ((`state` = 'unclaimed' AND `claimedEmail` IS NULL) OR
         (`state` = 'claimed' AND `claimedEmail` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `breadlineImportUser_next` SELECT `userId`, `telephone`, `state`, `claimedEmail`, `claimedAt`, `claimKey` FROM `breadlineImportUser`;
--> statement-breakpoint
DROP TABLE `breadlineImportUser`;
--> statement-breakpoint
ALTER TABLE `breadlineImportUser_next` RENAME TO `breadlineImportUser`;
