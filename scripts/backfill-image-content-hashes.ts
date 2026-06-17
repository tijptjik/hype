import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { AwsClient } from 'aws4fetch'
import { and, eq, isNull, or } from 'drizzle-orm'
import { drizzle as drizzleBunSqlite, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import {
  D1Helper,
  type BoundD1,
  type ProxyD1,
  useProxyD1,
} from '@nerdfolio/drizzle-d1-helpers'

import { image } from '../src/lib/db/schema'
import { ImageEnv } from '../src/lib/enums'
import { toCloudflareImageWorkerPath } from '../src/lib/images/delivery'
import { getOriginalsBucketNameForStage } from '../src/lib/images/storage'

type ImageStage = `${ImageEnv}`
type DrizzleDatabase = BoundD1 | ProxyD1 | BunSQLiteDatabase
type ScriptOptions = {
  batchSize: number
  dbStage: ImageStage
  dbStorage: 'local' | 'remote'
}
type MissingHashImageRow = {
  id: string
  env: string
  publicId: string
  version: number | null
}
type HashBackfillRow = MissingHashImageRow & {
  imageUrl: string
}

const DEFAULT_PUBLIC_BASE_URLS: Record<ImageStage, string> = {
  local: 'http://localhost:8788',
  preview: 'https://assets.preview.hype.hk',
  production: 'https://assets.hype.hk',
}

/**
 * Loads simple KEY=VALUE env files without overwriting existing process values.
 *
 * @param filePath Local env file path.
 * @returns Resolves after values are loaded when the file exists.
 */
const loadEnvFile = async (filePath: string): Promise<void> => {
  if (!existsSync(filePath)) return

  const contents = await readFile(filePath, 'utf8')

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key]) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

/**
 * Loads the R2-facing env files for the target asset stage.
 *
 * @param stage Asset stage the script will read from.
 * @returns Resolves after environment variables are available.
 */
const loadAssetEnvForStage = async (stage: ImageStage): Promise<void> => {
  await loadEnvFile('.dev.vars')

  if (stage === ImageEnv.production) {
    await loadEnvFile('.dev.vars.production')
    return
  }

  if (stage === ImageEnv.preview) {
    await loadEnvFile('.dev.vars.preview')
  }
}

/**
 * Loads the D1 proxy credentials file for remote execution.
 *
 * @param stage Remote D1 environment.
 * @returns Resolves after remote DB credentials are loaded.
 */
const loadRemoteDbCredentials = async (
  stage: Exclude<ImageStage, 'local'>,
): Promise<void> => {
  if (stage === ImageEnv.preview) {
    await loadEnvFile('.env.drizzle.preview.local')
    return
  }

  await loadEnvFile('.env.drizzle.prod.local')
}

/**
 * Parses the small CLI surface for this backfill script.
 *
 * @returns Normalized runtime options.
 */
const parseOptions = (): ScriptOptions => {
  const useRemote = process.argv.includes('--remote')
  const stageFlagIndex = process.argv.indexOf('--stage')
  const rawStage =
    stageFlagIndex >= 0 ? process.argv[stageFlagIndex + 1] : ImageEnv.local

  if (
    rawStage !== ImageEnv.local &&
    rawStage !== ImageEnv.preview &&
    rawStage !== ImageEnv.production
  ) {
    throw new Error(`Unsupported --stage value: ${rawStage}`)
  }

  return {
    batchSize: 25,
    dbStage: rawStage,
    dbStorage: useRemote ? 'remote' : 'local',
  }
}

/**
 * Builds a public image URL for progress logging and manual spot-checking.
 *
 * @param row Image row that still needs a content hash.
 * @returns Public raw image URL for the current asset stage.
 */
const toImageUrl = (row: MissingHashImageRow): string => {
  const baseUrl =
    process.env.PUBLIC_ASSET_BASE_URL || DEFAULT_PUBLIC_BASE_URLS[row.env as ImageStage]

  return `${baseUrl}${toCloudflareImageWorkerPath({
    env: row.env,
    publicId: row.publicId,
    version: row.version,
    raw: true,
    rawTransformation: null,
  })}`
}

/**
 * Computes the lowercase SHA-256 hex digest for uploaded image bytes.
 *
 * @param bytes Exact stored original object bytes.
 * @returns Lowercase hexadecimal digest.
 */
const hashBytes = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Encodes an R2 object key so path separators are preserved.
 *
 * @param objectKey Canonical object key.
 * @returns URL-safe object path.
 */
const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

/**
 * Creates an R2 client from the repo's local env files.
 *
 * @returns AwsClient plus the account id required for requests.
 */
const createR2Client = (): { accountId: string; client: AwsClient } => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? ''
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID ?? ''
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY ?? ''

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing CLOUDFLARE_ACCOUNT_ID / R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY',
    )
  }

  return {
    accountId,
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'auto',
      service: 's3',
    }),
  }
}

/**
 * Downloads the exact stored original image bytes from R2.
 *
 * @param params Bucket access inputs.
 * @returns Raw object bytes for hashing.
 */
const fetchOriginalImageBytes = async (params: {
  accountId: string
  client: AwsClient
  objectKey: string
  stage: ImageStage
}): Promise<ArrayBuffer> => {
  const bucket = getOriginalsBucketNameForStage(params.stage)
  const url = `https://${params.accountId}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKeyPath(params.objectKey)}`
  const response = await params.client.fetch(url)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${params.objectKey} from ${bucket}: ${response.status} ${response.statusText}`,
    )
  }

  return await response.arrayBuffer()
}

/**
 * Loads all rows in the target stage that still need a content hash.
 *
 * @param db Drizzle database handle.
 * @param stage Target image stage.
 * @returns Ordered rows ready for backfill.
 */
const loadImagesMissingHashes = async (
  db: DrizzleDatabase,
  stage: ImageStage,
): Promise<HashBackfillRow[]> => {
  const rows = await db
    .select({
      id: image.id,
      env: image.env,
      publicId: image.publicId,
      version: image.version,
    })
    .from(image)
    .where(
      and(
        eq(image.env, stage),
        or(isNull(image.contentHash), eq(image.contentHash, '')),
      ),
    )

  return rows.map(row => ({
    ...row,
    imageUrl: toImageUrl(row),
  }))
}

/**
 * Splits a flat row list into fixed-size batches.
 *
 * @param rows Ordered rows to process.
 * @param batchSize Number of images per batch.
 * @returns Arrays of batches in processing order.
 */
const toBatches = <T>(rows: T[], batchSize: number): T[][] => {
  const batches: T[][] = []

  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize))
  }

  return batches
}

/**
 * Fetches originals from R2, hashes them, and writes the digest back to D1.
 *
 * @param db Drizzle database handle.
 * @param options Script runtime options.
 * @returns Resolves after all missing hashes in the target stage are filled.
 */
const runBackfill = async (
  db: DrizzleDatabase,
  options: ScriptOptions,
): Promise<void> => {
  const rows = await loadImagesMissingHashes(db, options.dbStage)

  console.log(
    `[image:hash:backfill] Found ${rows.length} ${options.dbStage} image(s) without contentHash`,
  )

  if (rows.length === 0) {
    return
  }

  const { accountId, client } = createR2Client()
  const batches = toBatches(rows, options.batchSize)

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(
      `[image:hash:backfill] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} images)`,
    )

    console.log(
      JSON.stringify({
        batch: batchIndex + 1,
        imageUrls: batch.map(row => row.imageUrl),
      }),
    )

    for (const row of batch) {
      const bytes = await fetchOriginalImageBytes({
        accountId,
        client,
        objectKey: row.publicId,
        stage: options.dbStage,
      })
      const contentHash = await hashBytes(bytes)

      await db
        .update(image)
        .set({ contentHash })
        .where(eq(image.id, row.id))

      console.log(
        `[image:hash:backfill] Updated ${row.id} ${row.publicId} ${contentHash}`,
      )
    }
  }
}

/**
 * Opens either the local persisted D1 file or the remote Cloudflare D1 proxy.
 *
 * @returns Resolves after the requested backfill run completes.
 */
const main = async (): Promise<void> => {
  const options = parseOptions()

  await loadAssetEnvForStage(options.dbStage)

  console.log(
    `[image:hash:backfill] Starting with db=${options.dbStorage}:${options.dbStage} batch=${options.batchSize}`,
  )

  if (options.dbStorage === 'local') {
    const helper = D1Helper.get('DB', {
      environment: options.dbStage === ImageEnv.local ? undefined : options.dbStage,
    }).withPersistTo('.wrangler/state/v3')
    const sqlite = new SQLiteDatabase(helper.sqliteLocalFile)

    try {
      const db = drizzleBunSqlite(sqlite)
      await runBackfill(db, options)
    } finally {
      sqlite.close()
    }

    return
  }

  if (options.dbStage === ImageEnv.local) {
    throw new Error('Remote DB access requires --stage preview or --stage production')
  }

  await loadRemoteDbCredentials(options.dbStage)

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_D1_TOKEN

  if (!accountId || !token) {
    throw new Error(
      `Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_D1_TOKEN for ${options.dbStage} backfill`,
    )
  }

  const helper = D1Helper.get('DB', { environment: options.dbStage })

  await useProxyD1(
    {
      accountId,
      databaseId: helper.databaseId,
      token,
    },
    async db => {
      await runBackfill(db, options)
    },
  )
}

await main()
