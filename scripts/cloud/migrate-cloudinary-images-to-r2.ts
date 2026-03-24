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
  dbPath?: string
  finalDbEnv: Stage
  filterId?: string
  limit?: number
  sqlOutPath: string
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
  version: number
}

const DEFAULT_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const DEFAULT_SQL_OUT_PATH = 'sql/data/cloudinary-to-r2-production.sql'

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
    finalDbEnv: 'production',
    sqlOutPath: DEFAULT_SQL_OUT_PATH,
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
        options.dbPath = argv[index + 1]
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
      case '--final-db-env':
        options.finalDbEnv = (argv[index + 1] as Stage | undefined) ?? 'production'
        index += 1
        break
      case '--sql-out':
        options.sqlOutPath = argv[index + 1]
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
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const targetStage = options.targetStage ?? 'production'
  const finalDbEnv = options.finalDbEnv ?? 'production'
  const bucket = options.bucket ?? DEFAULT_BUCKET_BY_STAGE[targetStage]

  if (!['local', 'preview', 'production'].includes(targetStage)) {
    throw new Error(`Invalid --target-stage value: ${targetStage}`)
  }

  if (!['local', 'preview', 'production'].includes(finalDbEnv)) {
    throw new Error(`Invalid --final-db-env value: ${finalDbEnv}`)
  }

  if (options.limit !== undefined && Number.isNaN(options.limit)) {
    throw new Error('Invalid --limit value')
  }

  return {
    bucket,
    dbPath: options.dbPath,
    finalDbEnv,
    filterId: options.filterId,
    limit: options.limit,
    sqlOutPath: options.sqlOutPath ?? DEFAULT_SQL_OUT_PATH,
    targetStage,
    write: options.write ?? false,
  }
}

/**
 * Resolves the local mirrored D1 sqlite database when no explicit path is provided.
 */
const resolveLocalDatabasePath = async (): Promise<string> => {
  const proc = Bun.spawn([
    'bash',
    '-lc',
    "find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -type f -name '*.sqlite' -print -quit",
  ])
  const output = await new Response(proc.stdout).text()
  const dbPath = output.trim()

  if (!dbPath) {
    throw new Error(
      'Could not find a local mirrored D1 database. Run `bun run db:mirror:prod:to:local` first or pass --db.',
    )
  }

  return dbPath
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
): MetadataDocument => ({
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
  metadata: extracted.metadata,
  sourceVersion: row.version,
  uploadedAt: row.createdAt,
  modifiedAt: row.modifiedAt,
})

const toManifestDocument = (row: LegacyImageRow): Record<string, string | number | null> => ({
  publicId: row.publicId,
  version: row.version,
  updatedAt: row.modifiedAt,
})

const toMetadataObjectKey = (publicId: string, version?: number): string =>
  version ? `${publicId}.v${version}.json` : `${publicId}.json`

const toManifestObjectKey = (publicId: string): string => `${publicId}.manifest.json`

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

const escapeSqlString = (value: string): string => value.replaceAll("'", "''")

const toSqlUpdateStatement = (row: LegacyImageRow, finalDbEnv: Stage): string =>
  [
    'UPDATE image',
    "SET cdn = 'cloudflareR2',",
    `    env = '${finalDbEnv}',`,
    '    cdnId = NULL',
    `WHERE id = '${escapeSqlString(row.id)}';`,
  ].join('\n')

const buildSqlFile = (rows: LegacyImageRow[], finalDbEnv: Stage): string => {
  const statements = rows.map(row => toSqlUpdateStatement(row, finalDbEnv))
  return [
    '-- Generated by scripts/cloud/migrate-cloudinary-images-to-r2.ts',
    '-- Source DB rows: cloudinary-backed images from the provided sqlite mirror',
    '-- Target bucket stage is controlled independently at runtime',
    `-- Final DB env in this SQL patch: ${finalDbEnv}`,
    'BEGIN TRANSACTION;',
    ...statements,
    'COMMIT;',
    '',
  ].join('\n')
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

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const migrateRow = async ({
  accountId,
  aws,
  bucket,
  row,
  write,
}: {
  accountId: string
  aws: AwsClient
  bucket: string
  row: LegacyImageRow
  write: boolean
}): Promise<MigrationResult> => {
  const version = row.version ?? 0
  if (!version) {
    throw new Error(`Image ${row.id} is missing a usable version`)
  }

  const cloudName = row.env || requireEnv('PUBLIC_CLOUDINARY_CLOUD_NAME')
  const cloudinaryUrl = toCloudinaryOriginalUrl(cloudName, row.publicId, version)
  const sourceResponse = await fetch(cloudinaryUrl)

  if (!sourceResponse.ok) {
    throw new Error(
      `Cloudinary source fetch failed for ${row.id}: ${sourceResponse.status} ${sourceResponse.statusText}`,
    )
  }

  const arrayBuffer = await sourceResponse.arrayBuffer()
  const sourceBuffer = Buffer.from(arrayBuffer)
  const contentType = inferContentType(
    sourceResponse.headers.get('content-type'),
    row.originalExtension,
  )
  const extractedMetadata = await extractMetadataFromSource({
    contentType,
    row,
    sourceBuffer,
  })
  const metadataDocument = toMetadataDocument(row, extractedMetadata)
  const metadataJson = JSON.stringify(metadataDocument, null, 2)
  const manifestJson = JSON.stringify(toManifestDocument(row), null, 2)

  if (write) {
    const originalExists = await objectExists({
      accountId,
      aws,
      bucket,
      objectKey: row.publicId,
    })

    if (!originalExists) {
      await putObject({
        accountId,
        aws,
        body: sourceBuffer,
        bucket,
        contentType,
        objectKey: row.publicId,
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
    version,
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.targetStage)
  const dbPath = options.dbPath ?? (await resolveLocalDatabasePath())
  if (!existsSync(dbPath)) {
    throw new Error(`SQLite database does not exist: ${dbPath}`)
  }
  const db = new Database(dbPath, { readonly: true })

  const rows = queryLegacyRows(db, options)
  if (rows.length === 0) {
    console.log('No Cloudinary-backed image rows found.')
    return
  }

  console.log(
    `Preparing ${rows.length} Cloudinary image ${rows.length === 1 ? 'row' : 'rows'} from ${dbPath}`,
  )
  console.log(`Target bucket stage: ${options.targetStage}`)
  console.log(`Target bucket: ${options.bucket}`)
  console.log(`Final DB env in generated SQL: ${options.finalDbEnv}`)
  console.log(`Mode: ${options.write ? 'sync' : 'plan'}`)

  const results: MigrationResult[] = []
  const failures: { id: string; message: string }[] = []

  if (!options.write) {
    const sql = buildSqlFile(rows, options.finalDbEnv)
    await mkdir(path.dirname(options.sqlOutPath), { recursive: true })
    await writeFile(options.sqlOutPath, sql, 'utf8')

    console.log(`Wrote SQL migration patch to ${options.sqlOutPath}`)
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
        row,
        write: options.write,
      })
      results.push(result)
      console.log(
        `${options.write ? 'Synced' : 'Planned'} ${row.id} -> ${row.publicId} (${result.contentType})`,
      )
      console.log(
        `  credit=${result.credit ?? 'null'}, cameraModel=${result.cameraModel ?? 'null'}, latitude=${result.latitude ?? 'null'}, longitude=${result.longitude ?? 'null'}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ id: row.id, message })
      console.error(`Failed ${row.id}: ${message}`)
    }
  }

  const migratedRows = rows.filter(row => results.some(result => result.id === row.id))
  const sql = buildSqlFile(migratedRows, options.finalDbEnv)
  await mkdir(path.dirname(options.sqlOutPath), { recursive: true })
  await writeFile(options.sqlOutPath, sql, 'utf8')

  console.log(`Wrote SQL migration patch to ${options.sqlOutPath}`)
  console.log(
    `Summary: ${results.length} successful, ${failures.length} failed, ${rows.length} total`,
  )

  if (failures.length > 0) {
    console.log('Failures:')
    for (const failure of failures) {
      console.log(`- ${failure.id}: ${failure.message}`)
    }
    process.exitCode = 1
  }
}

await main()
