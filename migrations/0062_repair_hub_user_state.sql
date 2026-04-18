CREATE TABLE IF NOT EXISTS `hubUserState` (
  `hubId` text NOT NULL,
  `userId` text NOT NULL,
  `subscriptionPromptDismissed` integer DEFAULT false NOT NULL,
  `subscriptionMember` integer DEFAULT false NOT NULL,
  `hasAgreedToTerms` integer DEFAULT false NOT NULL,
  `createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `modifiedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  PRIMARY KEY(`hubId`, `userId`),
  FOREIGN KEY (`hubId`) REFERENCES `hub`(`id`) ON UPDATE cascade ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE cascade ON DELETE cascade
);
