PRAGMA foreign_keys=ON;

-- Seed ELN book-cover images created locally on 2026-03-16 and their feature-image links.
-- Excludes the orphan image row `92AzggmnuI86`, which has no corresponding featureImage record.

INSERT OR IGNORE INTO "image" (
  "id",
  "contributorId",
  "cdn",
  "env",
  "cdnId",
  "publicId",
  "version",
  "originalFilename",
  "originalExtension",
  "originalWidth",
  "originalHeight",
  "metadata",
  "cameraModel",
  "capturedAt",
  "latitude",
  "longitude",
  "credit",
  "isArchived",
  "createdAt",
  "modifiedAt",
  "localIsArchived",
  "presentationMode"
)
VALUES
  ('Z1ibISz-RdzP', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'bfc95586146f5119502a573063fb8048', 'cgczhk/eln/fjihdm5ebgk7pcnm11tm', 1773629664, 'add-cyanide-to-taste-formatkey-webp-w800r', 'webp', 800, 1219, '{}', '', '2026-03-16T02:54:25.651Z', NULL, NULL, NULL, 0, '2026-03-16T02:54:25.723Z', '2026-03-16T02:54:30.591Z', NULL, 'contain'),
  ('Znagp40SA3F6', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '6574369bf26a6b85620e90503d3b84c5', 'cgczhk/eln/lvrjrshmnb720fzz7dsb', 1773629699, 'a-brief-history-of-living-forever_czech-formatkey-webp-default-r', 'webp', 645, 1000, '{}', '', '2026-03-16T02:54:59.784Z', NULL, NULL, NULL, 0, '2026-03-16T02:54:59.844Z', '2026-03-16T02:55:03.317Z', NULL, 'contain'),
  ('8m6HsscxFNZK', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '120e9e063d14940eec1819df16f09af4', 'cgczhk/eln/sbfjk0mczrf7i5yumz1l', 1773629724, 'about-people-v1-formatkey-webp-w800r', 'webp', 800, 1278, '{"ProfileDescription":"sRGB IEC61966-2.1"}', '', '2026-03-16T02:55:25.751Z', NULL, NULL, NULL, 0, '2026-03-16T02:55:25.830Z', '2026-03-16T02:55:28.976Z', NULL, 'contain'),
  ('sIh5GgBjhxW2', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'f208d76d16e97c0db7ab26d8036dd2b3', 'cgczhk/eln/tpvpcblwfvx9ehwa0b3m', 1773629744, 'red-queen_spain-v1-formatkey-webp-w800r', 'webp', 800, 1232, '{}', '', '2026-03-16T02:55:45.366Z', NULL, NULL, NULL, 0, '2026-03-16T02:55:45.444Z', '2026-03-16T02:55:47.954Z', NULL, 'contain'),
  ('fyIU49sso3pt', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'c8131c4fe75fbdc83a739f525879fe69', 'cgczhk/eln/qu6vqf523qfecvygal8p', 1773629765, 'the-clues-in-the-fjord-formatkey-webp-default-r', 'webp', 353, 541, '{}', '', '2026-03-16T02:56:05.803Z', NULL, NULL, NULL, 0, '2026-03-16T02:56:05.882Z', '2026-03-16T02:56:08.553Z', NULL, 'contain'),
  ('kVnblUsRt3sW', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '055fd97794305a7f765aa2f963633713', 'cgczhk/eln/ge5lqdqbanx2lw4wknbi', 1773629813, 'satantango-formatkey-webp-default-r', 'webp', 574, 854, '{}', '', '2026-03-16T02:56:54.219Z', NULL, NULL, NULL, 0, '2026-03-16T02:56:54.310Z', '2026-03-16T02:56:59.069Z', NULL, 'contain'),
  ('S6Cn8gvV91O6', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'd5037858bb27b7e964c1f892530af453', 'cgczhk/eln/spxcp7csbauihirabooq', 1773629840, 'the-lakes-water-is-never-sweet_italy-formatkey-webp-default-r', 'webp', 600, 900, '{}', '', '2026-03-16T02:57:21.570Z', NULL, NULL, NULL, 0, '2026-03-16T02:57:21.652Z', '2026-03-16T02:57:23.969Z', NULL, 'contain'),
  ('ycsr2PsULEl0', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '0a845e6510c28ea46aa4aeaa2fe29e90', 'cgczhk/eln/ueky7zuhtlsaigbnkvvj', 1773629855, 'the-bee-sting-formatkey-webp-w800r', 'webp', 800, 1228, '{}', '', '2026-03-16T02:57:36.187Z', NULL, NULL, NULL, 0, '2026-03-16T02:57:36.267Z', '2026-03-16T02:57:38.972Z', NULL, 'contain'),
  ('pSVh7o_lZ-Fi', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'ac43436d6db497dd7a27fe713d7f21d0', 'cgczhk/eln/hjhiud9yv7xluvarsztp', 1773629876, 'grand-hotel-europa-v1-formatkey-webp-w800r', 'webp', 800, 1226, '{}', '', '2026-03-16T02:57:56.795Z', NULL, NULL, NULL, 0, '2026-03-16T02:57:56.875Z', '2026-03-16T02:58:00.404Z', NULL, 'contain'),
  ('CoVguSOsv4Fa', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', '8ff9bab13057619ff01c79ce5f5d247c', 'cgczhk/eln/fpas5myedkymxamxrvzx', 1773629893, '81ld2bzvd6l._sl1500_-formatkey-webp-w800r', 'webp', 800, 1212, '{}', '', '2026-03-16T02:58:14.640Z', NULL, NULL, NULL, 0, '2026-03-16T02:58:14.722Z', '2026-03-16T02:58:27.292Z', NULL, 'contain'),
  ('-EsQ42Bi6B00', 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM', 'cloudinary', 'dg6vtsga1', 'ca30dc33b1d837d458b09c2054a9b450', 'cgczhk/eln/u4uo5or4kqqnbzcdhyu1', 1773629916, '56898088', 'jpg', 1400, 2128, '{"JFIFVersion":"1.01","ResolutionUnit":"inches","XResolution":"300","YResolution":"300","Colorspace":"RGB","DPI":"300"}', '', '2026-03-16T02:58:37.523Z', NULL, NULL, NULL, 0, '2026-03-16T02:58:37.599Z', '2026-03-16T02:58:40.657Z', NULL, 'contain');

INSERT OR IGNORE INTO "featureImage" (
  "featureId",
  "imageId",
  "intent",
  "isPublished",
  "publishedAt",
  "publisherId",
  "localIsPublished"
)
VALUES
  ('elnBook00001', 'Z1ibISz-RdzP', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00002', 'Znagp40SA3F6', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00003', '8m6HsscxFNZK', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00004', 'sIh5GgBjhxW2', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00005', 'fyIU49sso3pt', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00006', '-EsQ42Bi6B00', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00007', 'kVnblUsRt3sW', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00008', 'S6Cn8gvV91O6', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00009', 'ycsr2PsULEl0', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00010', 'pSVh7o_lZ-Fi', 'canonical', 1, NULL, NULL, NULL),
  ('elnBook00011', 'CoVguSOsv4Fa', 'canonical', 1, NULL, NULL, NULL);
