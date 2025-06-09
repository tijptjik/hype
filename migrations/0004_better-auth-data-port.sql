-- ============================================================================
-- Better-Auth Data Migration
-- ============================================================================
-- This migration ports existing AuthJS data to Better-Auth compatible schema
-- Foreign key constraints are disabled to avoid cascading deletes during migration

PRAGMA foreign_keys=OFF;

-- ============================================================================
-- 1. UPDATE SCHEMA (Create new tables)
-- ============================================================================

-- Drop existing tables and recreate with Better-Auth schema
DROP TABLE IF EXISTS `account`;
DROP TABLE IF EXISTS `session`;
DROP TABLE IF EXISTS `user`;

-- Create new account table compatible with Better-Auth
CREATE TABLE `account` (
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create new session table compatible with Better-Auth
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create verification table for Better-Auth
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

-- Update user table to be compatible with Better-Auth
-- Rename modifiedAt to updatedAt and change emailVerified to boolean
CREATE TABLE `user` (
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

-- ============================================================================
-- 2. MIGRATE USER DATA
-- ============================================================================

-- Port user data with emailVerified conversion (timestamp to boolean)
INSERT INTO `user`(
	`id`, `name`, `email`, `emailVerified`, `image`, `locale`, `attribution`, 
	`isArchived`, `preferences`, `experimental`, `createdAt`, `updatedAt`
) VALUES 
('4OwiIqe9ZkuA', 'Mart van de Ven', 'tijptjik@gmail.com', 0, 'https://lh3.googleusercontent.com/a/ACg8ocKhi50rWqWkFMgG0RFZQiAfswUrVUkvCq6jrVFnLLF9CVLbxuM=s96-c', 'en', null, 0, '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}', '{"contributorMode":false, "noLabelsMode":false}', '2025-06-06T08:43:30.862Z', '2025-06-06T08:43:30.862Z'),
('QQrveSvG10G2', 'Billy Potts', 'bp@handsomeco.com', 0, 'https://lh3.googleusercontent.com/a/ACg8ocIUlBt7j_AKWxFjHNwhdzJnxTAGZn_gC4hu5BijPnLtonQuSHcg=s96-c', 'en', null, 0, '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}', '{"contributorMode":false, "noLabelsMode":false}', '2025-06-06T08:14:48.789Z', '2025-06-06T08:14:48.789Z'),
('p6WnJ-DKl0c1', 'Mart van de Ven', 'm@type.hk', 1, 'https://lh3.googleusercontent.com/a/ACg8ocJiWWuBbf5n8GI5_0EeihmCiNbVGA8KWlVXEmwmTBqBwkEKEKBrhw=s96-c', 'en', 'tijptjik', 0, '{"fallbackLocales":["en"],"allowMachineTranslation":false,"isTranslateButtonVisible":true}', '{"contributorMode":true,"noLabelsMode":false,"fallbackLocales":[]}', '2024-08-27T04:52:16.884Z', '2025-06-06T08:20:51.524Z'),
('p6WnJ-DKl0c2', 'Mirian van Kampen', 'makampen@gmail.com', 0, 'https://lh3.googleusercontent.com/a/ACg8ocK95Jf4adp2Av4lYbijxqoaLN3TNMM2x9fNkUv47-6S9C9Cxkwq=s96-c', 'en', null, 0, '{"fallbackLocales":[],"allowMachineTranslation":false,"isTranslateButtonVisible":true}', '{"contributorMode":true,"noLabelsMode":false,"fallbackLocales":[]}', '2024-12-09T16:58:29.910Z', '2024-12-09T16:58:29.910Z');

-- Replace the old user table
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

-- ============================================================================
-- 3. MIGRATE ACCOUNT DATA (AuthJS to Better-Auth format)
-- ============================================================================

-- Port account data transforming from AuthJS to Better-Auth format
-- AuthJS: provider + providerAccountId -> Better-Auth: providerId + accountId
-- AuthJS: access_token -> Better-Auth: accessToken
-- AuthJS: refresh_token -> Better-Auth: refreshToken
-- AuthJS: expires_at (seconds) -> Better-Auth: accessTokenExpiresAt (milliseconds)

INSERT INTO `account`(
	`id`, `userId`, `accountId`, `providerId`, `accessToken`, `refreshToken`, 
	`accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `idToken`, 
	`password`, `createdAt`, `updatedAt`
) VALUES 
-- Account 1: User p6WnJ-DKl0c1, Google ID 100751897841477294261
('acc_p6WnJ-DKl0c1_1', 'p6WnJ-DKl0c1', '100751897841477294261', 'google', 'ya29.a0AcM612wEgAco-P2EIzkYndKCezdHR1LGfF2A9N7_CZI9NnPPljA6fUEWdeR_8KhGL8u_rgYxH4q17Zg8Coc8-o5OgXIBjtyutsZc-ZparJGeGCY5U7Gwa0mvM77btUzpt5hbqFNihb_8slswjJen3C_0utWY1tatbkRaXtlRaCgYKAeoSARISFQHGX2MixJZNagBg5lWWXGtZ6TKthw0175', '1//0eZxa1VfqiFUZCgYIARAAGA4SNwF-L9IrzmK7dsirC6iayKq1O7fGnpngJT90m3ZFp4X7opwjAGbgXdFzWFysV4b-F03rPIIVZAg', 1724737985000, null, 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid', 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImE0OTM5MWJmNTJiNThjMWQ1NjAyNTVjMmYyYTA0ZTU5ZTIyYTdiNjUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDA3NTE4OTc4NDE0NzcyOTQyNjEiLCJoZCI6InR5cGUuaGsiLCJlbWFpbCI6Im1AdHlwZS5oayIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiZkdGQ3NJSlZmSzl5R3IxQlhhY1k2dyIsIm5hbWUiOiJNYXJ0IHZhbiBkZSBWZW4iLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSmlXV3VCYmY1bjhHSTVfMEVlaWhtQ2lOYlZHQThLV2xWWEVtd21UQnFCd2tFK0VLQnJodz1zOTYtYyIsImdpdmVuX25hbWUiOiJNYXJ0IiwiZmFtaWx5X25hbWUiOiJ2YW4gZGUgVmVuIiwiaWF0IjoxNzI0NzM0Mzg2LCJleHAiOjE3MjQ3Mzc5ODZ9.KPmjzW1bVRCvIAI3qp8khqJD_dxRgmQXbhzZpGPXo_uRMbgJYly-AwhN-CXCD2LhSaKeEEKFgplErUwesQy7v4Rxt6fhjPhP18uUiVf5bFwAO5fTzXgLCN-WD1ossm8hJI2lfDGACV4wB6JTk0CwBdpHwXFNGzLowmiPDIcCCUh3ybGKC8RYCtiRMQOdjZQRRFTnjQ5HeUeGUEEbt_BZVkxGm-VK0RysMgMH7N1w0lXFRgGDlTbmMRLF_5V5-BrBe_2o2jftQzKPBx1ldlkDAj0saj0Atlt1FkyZQsPMqEdd0jQuyriqFZ-qPGH6cins4WMljxRSvb9wfYrxgk10Hg', null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z'),

-- Account 2: User p6WnJ-DKl0c2, Google ID 103518602425666787499  
('acc_p6WnJ-DKl0c2_1', 'p6WnJ-DKl0c2', '103518602425666787499', 'google', 'ya29.a0AeDClZCA_S0NkKFUvfIycqUD5IM9D6zPYR2x7yZBy6tFFRWkN0kmyWQn7gNk_cbwaomyJbeDz9rwHie4kwMIeoc6DB_0Zi5Df4eHzYdwPsTKkkP_LvhvpdrmEGPSIK3Xs0erNAZr_wdBhQkl1Yw7i6axLtGHr_rCGHiI9-4xaCgYKAcQSARISFQHGX2Mikw60cbhFA1blRIZ5OGxQkQ0175', '1//09E-oOmlHlMKrCgYIARAAGAkSNwF-L9IrZTe_ciUyyZ9YWADMuUDneGjaO1YOXozWwUEYoP3aRi-WNpdXFPaqUxI2ZYHVl0JArZY', 1733767108000, null, 'https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/userinfo.email', 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjOGEyMGFmN2ZjOThmOTdmNDRiMTQyYjRkNWQwODg0ZWIwOTM3YzQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDM1MTg2MDI0MjU2NjY3ODc0OTkiLCJlbWFpbCI6Im1ha2FtcGVuQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiSkcwY25oZGxnWS04STdOTUVBcFJIQSIsIm5hbWUiOiJNaXJpYW4gdmFuIEthbXBlbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLOTVKZjRhZHAyQXY0bFliaWp4cW9hTE4zVE5NTTJ4OWZOa1V2NDctNlM5QzlDeGt3cT1zOTYtYyIsImdpdmVuX25hbWUiOiJNaXJpYW4iLCJmYW1pbHlfbmFtZSI6InZhbiBLYW1wZW4iLCJpYXQiOjE3MzM3NjM1MDksImV4cCI6MTczMzc2NzEwOX0.HDFtzjYMMJN23xU1kPUdCvDQx42se1jo5YN-pnE96TVeniD5kyec3FgkFz4KdmuVYDfXADJr7_jA6b2cRclpgdya3cyTX8X7Q3WFBS-nzvdlkIodnMWVfgog5p2fNMJXv9_02rl_G_-FBo-lZYwr8RtuvwnEg1WBahQS_5l1bSmtxb6gj_sIUxRfQl0GOtoNBFJiDkLOn7ZzHw3Fkpov2aPAq5-P9d2pTonxS4NM3lNEblrDJseZT8VZg8aAA-V13m1vgaqfFJeI0jBjPIDnxnB6sv1s-njnvosU9YQMBGcU2B4ux_yoxLuB6xYQVk90R9RlRkfjZKwQSRm9prBAfw', null, '2024-12-09T16:58:29.910Z', '2024-12-09T16:58:29.910Z'),

-- Account 3: User QQrveSvG10G2, Google ID 103738977178238463968
('acc_QQrveSvG10G2_1', 'QQrveSvG10G2', '103738977178238463968', 'google', 'ya29.a0AW4Xtxi_zC3ICEHHhVuPR55ohZo5ZLYPDskL81IsOKWkP945CDPmhuRCLlMB8YALYkYGQpPNSvgXJQNM9Ihw-EclDhJ4AA7DV5mrFBh_5Vv92GEuSEV_aMJtxnorvD8a0n8DuDDJQ6VDDIHl1zO6KEnPDtqdGDvMAB7hqT1vaCgYKAf4SARcSFQHGX2MioY8bTmr2fb4RQuVgaTDBNw0175', '1//0eKmsBBsubj3wCgYIARAAGA4SNwF-L9IrKJ731YTa1s3mWg2dyiKct3jHtSjxh8SXaNh6a_2xUtQ7zIxdivpFYQX9zD1f0zKHuyQ', 1749201287000, null, 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile', 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJiNDM0Njk1OTQ0NTE4MjAxNDhiMzM5YzU4OGFlZGUzMDUxMDM5MTkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDM3Mzg5NzcxNzgyMzg0NjM5NjgiLCJoZCI6ImhhbmRzb21lY28uY29tIiwiZW1haWwiOiJicEBoYW5kc29tZWNvLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiVUhaNU5VVy1pbmt0clhTNzRnVWNmQSIsIm5hbWUiOiJCaWxseSBQb3R0cyIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJVWxCdDdqX0FLV3hGakhOd2hkekpueFRBR1puX2dDNGh1NUJpalBuTHRvblF1U0hjZz1zOTYtYyIsImdpdmVuX25hbWUiOiJCaWxseSIsImZhbWlseV9uYW1lIjoiUG90dHMiLCJpYXQiOjE3NDkxOTc2ODgsImV4cCI6MTc0OTIwMTI4OH0.FASn2bi9FzEFcba9wkmXtzWq2jd0HtY3aYHSGVTxre6A4ykncdbd5Ewf6oHaL5_imXye8dm8jd7g4nJFhDPLjIzAGDWcFunixaJoLELfgvB4H_3quRhcL3qJB2Xf5-BwP9q5PJN5MNWO1R6xAyr7c12qZ3EtxxR9R5hO5heflH9NQRwVnA_gfdeHdTLM74pJe7nEe9MVsVLUzxW_ZoDg0HMVCVVGLjPmmrzes7hdXKCVFBwTN8sPKxpXZG7y5G4Z_EtMgUMFhnOJ9glnc69VTU_RroSmCVtQ9qst1BmuLnKF_wgpGZBpPZcgtaQMjdy_BDvAcoA1L0Mxl5xmS2gTfQ', null, '2025-06-06T08:14:48.789Z', '2025-06-06T08:14:48.789Z'),

-- Account 4: User 4OwiIqe9ZkuA, Google ID 115233916028787417650
('acc_4OwiIqe9ZkuA_1', '4OwiIqe9ZkuA', '115233916028787417650', 'google', 'ya29.a0AW4XtxiIisANbE5E4bbBr7Tjz1Wgll2MAKaDRkqyxhlNCbJ9UPPGrfLKv5znGQyY4T4RH7a9AlQUS2lh3Vgxv816pC81DhES3Q1szkOlpyzwy2MH1Dm4bjypyi6m0sIOtLBPXkpUWYugGRXhr3ILZh2M24bUlg_OK2fmZSdcaCgYKARcSARUSFQHGX2Mir1VlUyZk8tEr8wMInQju8Q0175', '1//0ePKR-ahNwpucCgYIARAAGA4SNgF-L9IreXbcWZS-K3nVRgSFSe9SvMTzt1m0HyCbO7JEbHnu0dLQEBw9Pl8aswUS13p4qaSv-A', 1749203009000, null, 'https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/userinfo.email', 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJiNDM0Njk1OTQ0NTE4MjAxNDhiMzM5YzU4OGFlZGUzMDUxMDM5MTkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI1NTg2NTc4MDMzMTMtcG5uZDhkcW8yN2wxcnZqNmQ2NG4xcW1rZTU3YW1wMmkuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMTUyMzM5MTYwMjg3ODc0MTc2NTAiLCJlbWFpbCI6InRpanB0amlrQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiMWVDZDA0RjZtd1dnUkQwWTdBUnRKZyIsIm5hbWUiOiJNYXJ0IHZhbiBkZSBWZW4iLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jS2hpNTByV3FXa0ZNZ0cwUkZaUWlBZnN3VXJWVWt2Q3E2anJWRm5MTEY5Q1ZMYnh1TT1zOTYtYyIsImdpdmVuX25hbWUiOiJNYXJ0IiwiZmFtaWx5X25hbWUiOiJ2YW4gZGUgVmVuIiwiaWF0IjoxNzQ5MTk5NDEwLCJleHAiOjE3NDkyMDMwMTB9.ffenDJq0dzrYZ1qP-6M99KQcKTK498OeNMJ5ehRta3vg0pPO6F2g_5QSV2I97fP3FrvoVshJv1hyBGFnQnxgId4dfrtvgKoA8Gtm3CNwTIRs9wKRFVu8C72T03YR8upmba6SfdEOEpOZtOuaEQ_vm8ECosJ4UhMlIwFv_QOVnKUZBuP9mYW-6xzHAo9eFjcxJG_Ycsr4sOdM1y5HSDCcPDswkwROfXgosDfu11LdSvUvHYi0Ef1v6tdChrOeNHtRJ_ET-FFNjP_nZlaWbEPOeYhMD3MLuHb8qu5fpVxKCOihzV-BfvV6PNmPzBmR7OSpaLBsfwNTbEnvG9VuBzDOVQ', null, '2025-06-06T08:43:30.862Z', '2025-06-06T08:43:30.862Z');

-- ============================================================================
-- 4. MIGRATE SESSION DATA (AuthJS to Better-Auth format)
-- ============================================================================

-- Port session data transforming from AuthJS to Better-Auth format
-- AuthJS: sessionToken -> Better-Auth: id (and also token field)
-- AuthJS: expires (timestamp) -> Better-Auth: expiresAt

INSERT INTO `session`(
	`id`, `userId`, `token`, `expiresAt`, `ipAddress`, `userAgent`, 
	`createdAt`, `updatedAt`
) VALUES 
('05e35b9a-7870-450a-ba67-6ccff2ddc53d', 'p6WnJ-DKl0c1', '05e35b9a-7870-450a-ba67-6ccff2ddc53d', 1751779407291, null, null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z'),
('2c5c331a-b72b-4e8d-aef6-3e28cd1bfe1e', 'p6WnJ-DKl0c1', '2c5c331a-b72b-4e8d-aef6-3e28cd1bfe1e', 1751959253847, null, null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z'),
('3ca6a843-4fb9-4288-8916-182aab66ab99', 'QQrveSvG10G2', '3ca6a843-4fb9-4288-8916-182aab66ab99', 1751789688801, null, null, '2025-06-06T08:14:48.789Z', '2025-06-06T08:14:48.789Z'),
('4b56b8e6-9a51-4ad9-9a29-28b1a813833f', 'p6WnJ-DKl0c2', '4b56b8e6-9a51-4ad9-9a29-28b1a813833f', 1749067355043, null, null, '2024-12-09T16:58:29.910Z', '2024-12-09T16:58:29.910Z'),
('b412ff94-d659-4260-a597-f0c3706981e0', 'p6WnJ-DKl0c1', 'b412ff94-d659-4260-a597-f0c3706981e0', 1751740103701, null, null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z'),
('b9961dfd-095b-43d3-898b-7bf00c3e9c65', 'p6WnJ-DKl0c1', 'b9961dfd-095b-43d3-898b-7bf00c3e9c65', 1749067355043, null, null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z'),
('bcd52a2a-8b6e-470f-9949-fbfded57b4e2', 'p6WnJ-DKl0c1', 'bcd52a2a-8b6e-470f-9949-fbfded57b4e2', 1751906544603, null, null, '2024-08-27T04:52:16.884Z', '2024-08-27T04:52:16.884Z');

-- ============================================================================
-- 5. RE-ENABLE FOREIGN KEYS
-- ============================================================================

PRAGMA foreign_keys=ON; 