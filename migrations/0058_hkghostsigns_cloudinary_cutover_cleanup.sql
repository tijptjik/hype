-- Custom SQL migration file, put your code below! --
-- Source verification date: 2026-03-31
-- Cloudinary probe: canonical versioned delivery URL, 3 attempts per image id
-- Successful downloads migrate to Cloudflare R2 production metadata.
-- Consistent Cloudinary 404s are deleted from the database.

PRAGMA foreign_keys=OFF;

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = '-2hdzuT4PPWs';

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = '_tnyy6Tqcc-5';

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = 'EwC2kkxvu9cX';

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = 'oDZHWN9wlVYb';

UPDATE image
SET cdn = 'cloudflareR2',
    env = 'production',
    cdnId = NULL
WHERE id = 'zvl3tx9c6UU2';

DELETE FROM taskImage
WHERE imageId IN (
  'rbtf2nAutWbD',
  'Emo1qZeR2fix',
  'z465Fx-tV6ky',
  'NG4rx4Qey2lL',
  'U5K-MUH2Ld_c',
  'nu7YYEzeLb7S',
  'BqmTGq5Hx89b',
  'FB-VirrVd07I',
  'qSXpuWSt1ODH',
  'EFsm8Tt0FbYa',
  'wSv7huaEFOVd',
  'wEFlKQ0Ta-Xq',
  'skQ0gTJUF1hc',
  's-Jnqf7jCJNl'
);

DELETE FROM featureImage
WHERE imageId IN (
  'rbtf2nAutWbD',
  'Emo1qZeR2fix',
  'z465Fx-tV6ky',
  'NG4rx4Qey2lL',
  'U5K-MUH2Ld_c',
  'nu7YYEzeLb7S',
  'BqmTGq5Hx89b',
  'FB-VirrVd07I',
  'qSXpuWSt1ODH',
  'EFsm8Tt0FbYa',
  'wSv7huaEFOVd',
  'wEFlKQ0Ta-Xq',
  'skQ0gTJUF1hc',
  's-Jnqf7jCJNl'
);

DELETE FROM image
WHERE id IN (
  'rbtf2nAutWbD',
  'Emo1qZeR2fix',
  'z465Fx-tV6ky',
  'NG4rx4Qey2lL',
  'U5K-MUH2Ld_c',
  'nu7YYEzeLb7S',
  'BqmTGq5Hx89b',
  'FB-VirrVd07I',
  'qSXpuWSt1ODH',
  'EFsm8Tt0FbYa',
  'wSv7huaEFOVd',
  'wEFlKQ0Ta-Xq',
  'skQ0gTJUF1hc',
  's-Jnqf7jCJNl'
);

PRAGMA foreign_keys=ON;
