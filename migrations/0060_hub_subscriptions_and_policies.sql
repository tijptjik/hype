ALTER TABLE `hub`
ADD `isSubscriptionAvailable` integer DEFAULT false NOT NULL;

ALTER TABLE `hub`
ADD `subscriptionService` text DEFAULT 'substack';

ALTER TABLE `hub`
ADD `subscriptionId` text;

ALTER TABLE `hub`
ADD `subscriptionPlacement` text DEFAULT '{"hubPanel":false,"topBar":false,"menu":true}' NOT NULL;

ALTER TABLE `hubI18n`
ADD `privacyPolicy` text;

ALTER TABLE `hubI18n`
ADD `termsOfService` text;

CREATE TABLE `hubUserState` (
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
