-- Migration: Backfill usernames for existing users
-- This migration updates users who don't have usernames yet

-- Update specific known users with their generated usernames and displayUsernames
UPDATE `user` SET `username` = 'ShinyBrownAardwolf', `displayUsername` = 'ShinyBrownAardwolf' WHERE `id` = '1CZAV0va8RE3rDaPjsoHbqsAPuYQoM8d' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'DueOrangeCentipede', `displayUsername` = 'DueOrangeCentipede' WHERE `id` = '4OwiIqe9ZkuA' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'LivelyTomatoCentipede', `displayUsername` = 'LivelyTomatoCentipede' WHERE `id` = '8biJSkrtdlTeyywyYhfqTZFl8WVADcWA' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'FemaleApricotHerring', `displayUsername` = 'FemaleApricotHerring' WHERE `id` = 'GKRnFRk1X5eGpmJQoDy8bRHYhqjvFbla' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'UnknownRedFlea', `displayUsername` = 'UnknownRedFlea' WHERE `id` = 'HTg9dka2sxOvgu0kIFKGIV6U0U4lEAEE' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'ZygomorphicRedGoldfish', `displayUsername` = 'ZygomorphicRedGoldfish' WHERE `id` = 'IBnQGAljFxgCJmyYsD0SdDOJUJSaNWIl' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'InternalVioletEgret', `displayUsername` = 'InternalVioletEgret' WHERE `id` = 'Iw4bEjVLxo35P3I75T9JtdYlBShZQVgs' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'BroadSalmonBonobo', `displayUsername` = 'BroadSalmonBonobo' WHERE `id` = 'QQrveSvG10G2' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'MinimumIvoryTern', `displayUsername` = 'MinimumIvoryTern' WHERE `id` = 'RpnXVs5xQgtbaUHxn2dqOcNSumxR8sOdzl76OFM' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'AwfulPinkEchidna', `displayUsername` = 'AwfulPinkEchidna' WHERE `id` = 'TRGicqaLSSLOZw9WJjhsR8sOdzl76OFM' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'SurvivingCyanHummingbird', `displayUsername` = 'SurvivingCyanHummingbird' WHERE `id` = 'TjkhsktAX6TApHtEZavNM8M07AFTsEBj' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'ClosedBlueTiger', `displayUsername` = 'ClosedBlueTiger' WHERE `id` = 'VC1Cr1m0t78DAduKxwXbmeFXT6OpNki6' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'ReasonableChocolateHeron', `displayUsername` = 'ReasonableChocolateHeron' WHERE `id` = 'koZSWXmAGfYEoBcHilvxLcjVy1ctxelN' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'FoolishIndigoAlbatross', `displayUsername` = 'FoolishIndigoAlbatross' WHERE `id` = 'p6WnJ-DKl0c2' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'ConservationTurquoiseAnt', `displayUsername` = 'ConservationTurquoiseAnt' WHERE `id` = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'GiantBronzeDeer', `displayUsername` = 'GiantBronzeDeer' WHERE `id` = 'rnbGAV6qHDM482Rg5J5dvieyYJBxrIOm' AND `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `username` = 'RegisteredApricotOx', `displayUsername` = 'RegisteredApricotOx' WHERE `id` = 't87mtadO8vHx9KMHq3s4VnW4r6vGteBK' AND `username` IS NULL;--> statement-breakpoint

-- For any remaining users without usernames, generate a simple fallback
-- First set the username, then copy it to displayUsername
UPDATE `user` SET `username` = 'User' || substr(hex(randomblob(4)), 1, 8) WHERE `username` IS NULL;--> statement-breakpoint
UPDATE `user` SET `displayUsername` = `username` WHERE `displayUsername` IS NULL AND `username` IS NOT NULL;--> statement-breakpoint 