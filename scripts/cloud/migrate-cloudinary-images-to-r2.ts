import { AwsClient } from 'aws4fetch'
import { Database } from 'bun:sqlite'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import {
  getCameraFromMetadata,
  getCapturedAtFromMetadata,
  getCoordinatesFromMetadata,
  getCreditFromMetadata,
  type ImageMetadataMap,
} from '../../src/lib/utils/image-metadata'

type Stage = 'local' | 'preview' | 'production'

type CliOptions = {
  bucket: string
  overwriteExisting: boolean
  sourcePath: string
  filterId?: string
  limit?: number
  missingLogOutPath: string
  targetStage: Stage
  write: boolean
}

type LegacyImageRow = {
  id: string
  cdn: string
  env: string | null
  cdnId: string | null
  publicId: string
  version: number | null
  originalFilename: string | null
  originalExtension: string | null
  originalWidth: number | null
  originalHeight: number | null
  metadata: string | null
  cameraModel: string | null
  capturedAt: string | null
  latitude: string | null
  longitude: string | null
  credit: string | null
  createdAt: string | null
  modifiedAt: string | null
}

type MetadataDocument = {
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
  latitude?: string | null
  longitude?: string | null
  metadata?: Record<string, string> | null
  sourceVersion?: number | null
  uploadedAt?: string | null
  modifiedAt?: string | null
}

type ExtractedMetadata = {
  cameraModel: string | null
  capturedAt: string | null
  credit: string | null
  latitude: string | null
  longitude: string | null
  metadata: Record<string, string> | null
  originalExtension: string | null
  originalHeight: number | null
  originalWidth: number | null
}

type MigrationResult = {
  cameraModel: string | null
  cloudinaryUrl: string
  contentLength: number | null
  contentType: string
  credit: string | null
  id: string
  latitude: string | null
  longitude: string | null
  publicId: string
  rawObjectKey: string
  version: number
}

type SourceFetchResult = {
  arrayBuffer: ArrayBuffer
  contentType: string
  url: string
}

const DEFAULT_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const DEFAULT_SOURCE_PATH = 'sql/backup/hype-db-prod-2026-03-26T09:59:42-ordered.sql'
const DEFAULT_MISSING_LOG_OUT_PATH = 'tmp/cloudinary-migration-missing-images.log'
const OBJECT_KEY_PREFIX = 'h/'
const RAW_OBJECT_SUFFIX = '.raw'
const MAX_SOURCE_FETCH_ATTEMPTS = 3

const loadEnvFile = async (filePath: string): Promise<void> => {
  if (!existsSync(filePath)) return

  const file = Bun.file(filePath)
  const contents = await file.text()

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

const loadLocalEnvForStage = async (stage: Stage): Promise<void> => {
  await loadEnvFile('.dev.vars')

  if (stage === 'production') {
    await loadEnvFile('.dev.vars.production')
    return
  }

  if (stage === 'preview') {
    await loadEnvFile('.dev.vars.preview')
  }
}

const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    missingLogOutPath: DEFAULT_MISSING_LOG_OUT_PATH,
    overwriteExisting: false,
    sourcePath: DEFAULT_SOURCE_PATH,
    targetStage: 'production',
    write: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--bucket':
        options.bucket = argv[index + 1]
        index += 1
        break
      case '--db':
      case '--source':
        options.sourcePath = argv[index + 1]
        index += 1
        break
      case '--filter-id':
        options.filterId = argv[index + 1]
        index += 1
        break
      case '--limit':
        options.limit = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--missing-log-out':
        options.missingLogOutPath = argv[index + 1]
        index += 1
        break
      case '--stage':
      case '--target-stage':
        options.targetStage = (argv[index + 1] as Stage | undefined) ?? 'production'
        index += 1
        break
      case '--write':
        options.write = true
        break
      case '--overwrite-existing':
        options.overwriteExisting = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const targetStage = options.targetStage ?? 'production'
  const bucket = options.bucket ?? DEFAULT_BUCKET_BY_STAGE[targetStage]

  if (!['local', 'preview', 'production'].includes(targetStage)) {
    throw new Error(`Invalid --target-stage value: ${targetStage}`)
  }

  if (options.limit !== undefined && Number.isNaN(options.limit)) {
    throw new Error('Invalid --limit value')
  }

  return {
    bucket,
    filterId: options.filterId,
    limit: options.limit,
    missingLogOutPath: options.missingLogOutPath ?? DEFAULT_MISSING_LOG_OUT_PATH,
    overwriteExisting: options.overwriteExisting ?? false,
    sourcePath: options.sourcePath ?? DEFAULT_SOURCE_PATH,
    targetStage,
    write: options.write ?? false,
  }
}

/**
 * Repeatedly parses stringified JSON payloads until a non-string value is produced.
 */
const parseNestedJson = (value: string | null): Record<string, string> | null => {
  if (!value) return null

  let nextValue: unknown = value
  for (let index = 0; index < 3; index += 1) {
    if (typeof nextValue !== 'string') break

    try {
      nextValue = JSON.parse(nextValue)
    } catch {
      break
    }
  }

  if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
    return null
  }

  return Object.fromEntries(
    Object.entries(nextValue).map(([key, entryValue]) => [key, String(entryValue ?? '')]),
  )
}

const encodePublicIdPath = (publicId: string): string =>
  publicId
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const toCloudinaryOriginalUrl = (cloudName: string, publicId: string, version: number): string =>
  `https://res.cloudinary.com/${encodeURIComponent(
    cloudName,
  )}/image/upload/v${version}/${encodePublicIdPath(publicId)}`

const inferContentType = (contentType: string | null, extension: string | null): string => {
  if (contentType) return contentType

  switch ((extension ?? '').toLowerCase()) {
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'jxl':
      return 'image/jxl'
    case 'png':
      return 'image/png'
    case 'svg':
    case 'svgz':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

const inferExtension = (contentType: string, format?: string): string | null => {
  const normalizedFormat = (format ?? '').toLowerCase()
  if (normalizedFormat === 'jpeg') return 'jpg'
  if (normalizedFormat) return normalizedFormat

  switch (contentType.toLowerCase()) {
    case 'image/avif':
      return 'avif'
    case 'image/gif':
      return 'gif'
    case 'image/jpeg':
      return 'jpg'
    case 'image/jxl':
      return 'jxl'
    case 'image/png':
      return 'png'
    case 'image/svg+xml':
      return 'svg'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

const parseIdentifyMetadata = (value: string): Record<string, string> | null => {
  const metadata: Record<string, string> = {}
  const lines = value.split(/\r?\n/u)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('exif:')) continue

    const separatorIndex = trimmed.indexOf(': ', 5)
    if (separatorIndex === -1) continue

    const key = trimmed.slice(5, separatorIndex).trim()
    const entryValue = trimmed.slice(separatorIndex + 2).trim()
    if (!key) continue

    metadata[key] = entryValue
  }

  return Object.keys(metadata).length > 0 ? metadata : null
}

const extractMetadataFromSource = async ({
  contentType,
  row,
  sourceBuffer,
}: {
  contentType: string
  row: LegacyImageRow
  sourceBuffer: Buffer
}): Promise<ExtractedMetadata> => {
  const imageMetadata = await sharp(sourceBuffer, { failOn: 'none' }).metadata()
  const tmpPath = path.join(
    os.tmpdir(),
    `hype-image-migrate-${row.id}-${Date.now()}.${inferExtension(contentType, imageMetadata.format) ?? 'bin'}`,
  )

  let parsedExif: ImageMetadataMap | null = null

  try {
    await Bun.write(tmpPath, sourceBuffer)
    const identify = Bun.spawn(['identify', '-verbose', tmpPath], {
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const output = await new Response(identify.stdout).text()
    parsedExif = parseIdentifyMetadata(output)
  } catch {
    parsedExif = null
  } finally {
    if (existsSync(tmpPath)) {
      await unlink(tmpPath).catch(() => {})
    }
  }

  const coordinates = parsedExif ? getCoordinatesFromMetadata(parsedExif) : {}
  const capturedAt = parsedExif
    ? getCapturedAtFromMetadata(parsedExif)
    : (row.capturedAt ?? null)

  return {
    cameraModel: parsedExif ? (getCameraFromMetadata(parsedExif) ?? row.cameraModel) : row.cameraModel,
    capturedAt,
    credit: parsedExif ? (getCreditFromMetadata(parsedExif) ?? row.credit) : row.credit,
    latitude: coordinates.latitude ?? row.latitude,
    longitude: coordinates.longitude ?? row.longitude,
    metadata: parsedExif ?? parseNestedJson(row.metadata),
    originalExtension:
      inferExtension(contentType, imageMetadata.format) ?? row.originalExtension,
    originalHeight: imageMetadata.height ?? row.originalHeight,
    originalWidth: imageMetadata.width ?? row.originalWidth,
  }
}

const toMetadataDocument = (
  row: LegacyImageRow,
  extracted: ExtractedMetadata,
): MetadataDocument => {
  const namespacedPublicId = toNamespacedPublicId(row.publicId)

  return {
    originalFilename:
      row.originalFilename ??
      row.publicId.split('/').at(-1) ??
      null,
    originalExtension: extracted.originalExtension,
    originalWidth: extracted.originalWidth,
    originalHeight: extracted.originalHeight,
    cameraModel: extracted.cameraModel,
    capturedAt: extracted.capturedAt,
    credit: extracted.credit,
    latitude: extracted.latitude,
    longitude: extracted.longitude,
    metadata: {
      ...(extracted.metadata ?? {}),
      originalObjectKey: `${namespacedPublicId}${RAW_OBJECT_SUFFIX}`,
      workingObjectKey: namespacedPublicId,
    },
    sourceVersion: row.version,
    uploadedAt: row.createdAt,
    modifiedAt: row.modifiedAt,
  }
}

const toManifestDocument = (
  row: LegacyImageRow,
): Record<string, string | number | boolean | null> => {
  const namespacedPublicId = toNamespacedPublicId(row.publicId)

  return {
    hasRaw: true,
    originalObjectKey: `${namespacedPublicId}${RAW_OBJECT_SUFFIX}`,
    publicId: namespacedPublicId,
    version: row.version,
    workingObjectKey: namespacedPublicId,
    updatedAt: row.modifiedAt,
  }
}

const toNamespacedPublicId = (publicId: string): string =>
  publicId.startsWith(OBJECT_KEY_PREFIX) ? publicId : `${OBJECT_KEY_PREFIX}${publicId}`

const toMetadataObjectKey = (publicId: string, version?: number): string =>
  version
    ? `${toNamespacedPublicId(publicId)}.v${version}.json`
    : `${toNamespacedPublicId(publicId)}.json`

const toManifestObjectKey = (publicId: string): string =>
  `${toNamespacedPublicId(publicId)}.manifest.json`

const toWorkingObjectKey = (publicId: string): string => toNamespacedPublicId(publicId)

const toRawObjectKey = (publicId: string): string =>
  `${toNamespacedPublicId(publicId)}${RAW_OBJECT_SUFFIX}`

const toR2ObjectUrl = (
  accountId: string,
  bucket: string,
  objectKey: string,
): string =>
  `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')}`

/**
 * Uploads a single object to R2 through the S3-compatible API.
 */
const putObject = async ({
  aws,
  accountId,
  bucket,
  objectKey,
  body,
  contentType,
}: {
  accountId: string
  aws: AwsClient
  body: BodyInit
  bucket: string
  contentType: string
  objectKey: string
}): Promise<void> => {
  const response = await aws.fetch(toR2ObjectUrl(accountId, bucket, objectKey), {
    method: 'PUT',
    headers: {
      'content-type': contentType,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(
      `R2 upload failed for ${objectKey}: ${response.status} ${response.statusText}`,
    )
  }
}

const objectExists = async ({
  aws,
  accountId,
  bucket,
  objectKey,
}: {
  accountId: string
  aws: AwsClient
  bucket: string
  objectKey: string
}): Promise<boolean> => {
  const response = await aws.fetch(toR2ObjectUrl(accountId, bucket, objectKey), {
    method: 'HEAD',
  })

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    throw new Error(
      `R2 existence check failed for ${objectKey}: ${response.status} ${response.statusText}`,
    )
  }

  return true
}

const queryLegacyRows = (
  db: Database,
  options: Pick<CliOptions, 'filterId' | 'limit'>,
): LegacyImageRow[] => {
  const availableColumns = new Set(
    (
      db
        .query("PRAGMA table_info('image')")
        .all() as Array<{ name?: string | null }>
    )
      .map(column => column.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  )

  const selectColumn = (name: keyof LegacyImageRow, fallback: string): string =>
    availableColumns.has(name as string) ? String(name) : `${fallback} AS ${String(name)}`

  const whereClauses = ["cdn = 'cloudinary'"]
  const bindings: (string | number)[] = []

  if (options.filterId) {
    whereClauses.push('id = ?')
    bindings.push(options.filterId)
  }

  let sql = `
    SELECT
      id,
      cdn,
      env,
      cdnId,
      publicId,
      version,
      ${selectColumn('originalFilename', 'NULL')},
      ${selectColumn('originalExtension', 'NULL')},
      ${selectColumn('originalWidth', 'NULL')},
      ${selectColumn('originalHeight', 'NULL')},
      ${selectColumn('metadata', 'NULL')},
      ${selectColumn('cameraModel', 'NULL')},
      ${selectColumn('capturedAt', 'NULL')},
      ${selectColumn('latitude', 'NULL')},
      ${selectColumn('longitude', 'NULL')},
      ${selectColumn('credit', 'NULL')},
      createdAt,
      modifiedAt
    FROM image
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY createdAt ASC, id ASC
  `

  if (options.limit) {
    sql += ` LIMIT ${options.limit}`
  }

  return db.query(sql).all(...bindings) as LegacyImageRow[]
}

/**
 * Loads either a sqlite mirror or an ordered SQL dump into a queryable sqlite database.
 */
const openSourceDatabase = async (sourcePath: string): Promise<Database> => {
  if (!existsSync(sourcePath)) {
    throw new Error(`Source database does not exist: ${sourcePath}`)
  }

  if (sourcePath.endsWith('.sqlite')) {
    return new Database(sourcePath, { readonly: true })
  }

  if (sourcePath.endsWith('.sql')) {
    const db = new Database(':memory:')
    const sql = await Bun.file(sourcePath).text()
    const sanitizedSql = sql
      .replace(/^DELETE FROM sqlite_sequence;\n?/gmu, '')
      .replace(/^INSERT INTO "sqlite_sequence".*;\n?/gmu, '')
    db.exec(sanitizedSql)
    return db
  }

  throw new Error(
    `Unsupported --source path: ${sourcePath}. Expected a .sqlite mirror or .sql ordered dump.`,
  )
}

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/**
 * Fetches the Cloudinary source asset with bounded retries to handle flaky export reads.
 */
const fetchSourceWithRetries = async ({
  contentTypeHint,
  publicId,
  rowId,
  url,
}: {
  contentTypeHint: string | null
  publicId: string
  rowId: string
  url: string
}): Promise<SourceFetchResult> => {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_SOURCE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        lastError = new Error(
          `Cloudinary source fetch failed for ${rowId} (${publicId}) on attempt ${attempt}/${MAX_SOURCE_FETCH_ATTEMPTS}: ${response.status} ${response.statusText}`,
        )
      } else {
        return {
          arrayBuffer: await response.arrayBuffer(),
          contentType: inferContentType(response.headers.get('content-type'), contentTypeHint),
          url,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (attempt < MAX_SOURCE_FETCH_ATTEMPTS) {
      await sleep(attempt * 250)
    }
  }

  throw (
    lastError ??
    new Error(`Cloudinary source fetch failed for ${rowId} (${publicId}) after retries`)
  )
}

const migrateRow = async ({
  accountId,
  aws,
  bucket,
  row,
  overwriteExisting,
  write,
}: {
  accountId: string
  aws: AwsClient
  bucket: string
  overwriteExisting: boolean
  row: LegacyImageRow
  write: boolean
}): Promise<MigrationResult> => {
  const version = row.version ?? 0
  if (!version) {
    throw new Error(`Image ${row.id} is missing a usable version`)
  }

  const cloudName = row.env || requireEnv('PUBLIC_CLOUDINARY_CLOUD_NAME')
  const cloudinaryUrl = toCloudinaryOriginalUrl(cloudName, row.publicId, version)
  const sourceAsset = await fetchSourceWithRetries({
    contentTypeHint: row.originalExtension,
    publicId: row.publicId,
    rowId: row.id,
    url: cloudinaryUrl,
  })
  const arrayBuffer = sourceAsset.arrayBuffer
  const sourceBuffer = Buffer.from(arrayBuffer)
  const contentType = sourceAsset.contentType
  const extractedMetadata = await extractMetadataFromSource({
    contentType,
    row,
    sourceBuffer,
  })
  const metadataDocument = toMetadataDocument(row, extractedMetadata)
  const metadataJson = JSON.stringify(metadataDocument, null, 2)
  const manifestJson = JSON.stringify(toManifestDocument(row), null, 2)

  if (write) {
    const workingObjectKey = toWorkingObjectKey(row.publicId)
    const originalExists = overwriteExisting
      ? false
      : await objectExists({
          accountId,
          aws,
          bucket,
          objectKey: workingObjectKey,
        })

    if (!originalExists || overwriteExisting) {
      await putObject({
        accountId,
        aws,
        body: sourceBuffer,
        bucket,
        contentType,
        objectKey: workingObjectKey,
      })
    }

    const rawObjectKey = toRawObjectKey(row.publicId)
    const rawExists = overwriteExisting
      ? false
      : await objectExists({
          accountId,
          aws,
          bucket,
          objectKey: rawObjectKey,
        })

    if (!rawExists || overwriteExisting) {
      await putObject({
        accountId,
        aws,
        body: sourceBuffer,
        bucket,
        contentType,
        objectKey: rawObjectKey,
      })
    }

    await putObject({
      accountId,
      aws,
      body: metadataJson,
      bucket,
      contentType: 'application/json; charset=utf-8',
      objectKey: toMetadataObjectKey(row.publicId),
    })

    await putObject({
      accountId,
      aws,
      body: metadataJson,
      bucket,
      contentType: 'application/json; charset=utf-8',
      objectKey: toMetadataObjectKey(row.publicId, version),
    })

    await putObject({
      accountId,
      aws,
      body: manifestJson,
      bucket,
      contentType: 'application/json; charset=utf-8',
      objectKey: toManifestObjectKey(row.publicId),
    })
  }

  return {
    cameraModel: extractedMetadata.cameraModel,
    cloudinaryUrl,
    contentLength: arrayBuffer.byteLength,
    contentType,
    credit: extractedMetadata.credit,
    id: row.id,
    latitude: extractedMetadata.latitude,
    longitude: extractedMetadata.longitude,
    publicId: row.publicId,
    rawObjectKey: toRawObjectKey(row.publicId),
    version,
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.targetStage)
  const db = await openSourceDatabase(options.sourcePath)

  const rows = queryLegacyRows(db, options)
  if (rows.length === 0) {
    console.log('No Cloudinary-backed image rows found.')
    return
  }

  console.log(
    `Preparing ${rows.length} Cloudinary image ${rows.length === 1 ? 'row' : 'rows'} from ${options.sourcePath}`,
  )
  console.log(`Target bucket stage: ${options.targetStage}`)
  console.log(`Target bucket: ${options.bucket}`)
  console.log(`Mode: ${options.write ? 'sync' : 'plan'}`)
  console.log(`Source mode: ${options.sourcePath.endsWith('.sql') ? 'ordered SQL dump' : 'sqlite mirror'}`)

  const results: MigrationResult[] = []
  const failures: { id: string; message: string }[] = []
  const missingSources: { id: string; publicId: string; url: string; message: string }[] = []

  if (!options.write) {
    console.log(`Summary: ${rows.length} candidate rows, 0 validated writes, 0 failures`)
    return
  }

  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const accessKeyId = requireEnv('R2_S3_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('R2_S3_SECRET_ACCESS_KEY')

  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
  })

  for (const row of rows) {
    try {
      const result = await migrateRow({
        accountId,
        aws,
        bucket: options.bucket,
        overwriteExisting: options.overwriteExisting,
        row,
        write: options.write,
      })
      results.push(result)
      console.log(
        `${options.write ? 'Synced' : 'Planned'} ${row.id} -> ${row.publicId} (${result.contentType})`,
      )
      console.log(`  rawObjectKey=${result.rawObjectKey}`)
      console.log(
        `  credit=${result.credit ?? 'null'}, cameraModel=${result.cameraModel ?? 'null'}, latitude=${result.latitude ?? 'null'}, longitude=${result.longitude ?? 'null'}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ id: row.id, message })
      if (message.includes('Cloudinary source fetch failed')) {
        missingSources.push({
          id: row.id,
          publicId: row.publicId,
          url: toCloudinaryOriginalUrl(
            row.env || process.env.PUBLIC_CLOUDINARY_CLOUD_NAME || 'unknown-cloud',
            row.publicId,
            row.version ?? 0,
          ),
          message,
        })
      }
      console.error(`Failed ${row.id}: ${message}`)
    }
  }

  console.log(
    `Summary: ${results.length} successful, ${failures.length} failed, ${rows.length} total`,
  )

  if (missingSources.length > 0) {
    await mkdir(path.dirname(options.missingLogOutPath), { recursive: true })
    const missingLog = [
      '# Cloudinary source failures',
      ...missingSources.map(
        failure =>
          `${failure.id}\t${failure.publicId}\t${failure.url}\t${failure.message}`,
      ),
      '',
    ].join('\n')
    await writeFile(options.missingLogOutPath, missingLog, 'utf8')
    console.log(`Wrote missing source log to ${options.missingLogOutPath}`)
  }

  if (failures.length > 0) {
    console.log('Failures:')
    for (const failure of failures) {
      console.log(`- ${failure.id}: ${failure.message}`)
    }
    process.exitCode = 1
  }
}

await main()
