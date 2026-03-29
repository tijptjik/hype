import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

type Stage = 'local' | 'preview' | 'production'
type Mode = 'prepare' | 'sync'

type CliOptions = {
  bucket: string
  concurrency: number
  limit?: number
  maxDimension: number
  mode: Mode
  onlyFormat?: 'tiff'
  outDir: string
  prefix?: string
  stage: Stage
}

type ObjectSummary = {
  key: string
  size: number
}

type PreparedImageInfo = {
  generatedContentType: string
  originalHeight: number | null
  originalObjectKey?: string
  originalPreservedAsRaw: boolean
  originalContentType: string
  originalWidth: number | null
  resized: boolean
  transcoded: boolean
  uploadedHeight: number | null
  uploadedWidth: number | null
}

type ImageMetadataDocument = {
  originalFilename?: string | null
  originalExtension?: string | null
  originalHeight?: number | null
  originalWidth?: number | null
  metadata?: Record<string, string> | null
  [key: string]: unknown
}

const DEFAULT_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const MANIFEST_SUFFIX = '.manifest.json'
const METADATA_SUFFIX = '.json'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ENVIRONMENT
// - loadEnvFile
// - loadLocalEnvForStage
// - createR2Client
// - getAccountId
//
// 2. CLI
// - parseArgs
//
// 3. R2 HELPERS
// - encodeObjectKeyPath
// - buildBucketUrl
// - listObjects
// - fetchObject
// - putObject
//
// 4. FILE HELPERS
// - ensureParentDir
// - listLocalFiles
// - inferContentTypeFromKey
//
// 5. NORMALIZATION
// - isOriginalImageKey
// - toMetadataPublicId
// - normalizeImageBuffer
// - updateMetadataDocument
// - mapWithConcurrency
//
// 6. MODES
// - runPrepare
// - runSync
//
// 7. ENTRYPOINT
// - main
// ---

const loadEnvFile = async (filePath: string): Promise<void> => {
  if (!existsSync(filePath)) return

  const contents = await Bun.file(filePath).text()

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

const createR2Client = (): AwsClient => {
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_S3_ACCESS_KEY_ID or R2_S3_SECRET_ACCESS_KEY')
  }

  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

const getAccountId = (): string => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID')
  }

  return accountId
}

const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    bucket: DEFAULT_BUCKET_BY_STAGE.production,
    concurrency: 4,
    maxDimension: 2048,
    mode: 'prepare',
    outDir: 'tmp/r2-normalized/production',
    stage: 'production',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--bucket':
        options.bucket = argv[index + 1]
        index += 1
        break
      case '--concurrency':
        options.concurrency = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--limit':
        options.limit = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--max-dimension':
        options.maxDimension = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--mode':
        options.mode = argv[index + 1] as Mode
        index += 1
        break
      case '--only-format':
        options.onlyFormat = argv[index + 1] as 'tiff'
        index += 1
        break
      case '--out-dir':
        options.outDir = argv[index + 1]
        index += 1
        break
      case '--prefix':
        options.prefix = argv[index + 1]
        index += 1
        break
      case '--stage':
        options.stage = argv[index + 1] as Stage
        index += 1
        break
      default:
        break
    }
  }

  const stage = options.stage ?? 'production'
  if (stage !== 'local' && stage !== 'preview' && stage !== 'production') {
    throw new Error(`Invalid --stage value: ${String(stage)}`)
  }

  const mode = options.mode ?? 'prepare'
  if (mode !== 'prepare' && mode !== 'sync') {
    throw new Error(`Invalid --mode value: ${String(mode)}`)
  }

  const concurrency = options.concurrency ?? 4
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`Invalid --concurrency value: ${String(options.concurrency)}`)
  }

  const maxDimension = options.maxDimension ?? 2048
  if (!Number.isInteger(maxDimension) || maxDimension <= 0) {
    throw new Error(
      `Invalid --max-dimension value: ${String(options.maxDimension)}`,
    )
  }

  if (options.onlyFormat && options.onlyFormat !== 'tiff') {
    throw new Error(`Invalid --only-format value: ${String(options.onlyFormat)}`)
  }

  return {
    bucket: options.bucket ?? DEFAULT_BUCKET_BY_STAGE[stage],
    concurrency,
    maxDimension,
    mode,
    ...(options.onlyFormat ? { onlyFormat: options.onlyFormat } : {}),
    outDir: options.outDir ?? `tmp/r2-normalized/${stage}`,
    stage,
    ...(options.prefix ? { prefix: options.prefix } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  }
}

const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const buildBucketUrl = (bucket: string, objectKey?: string): URL => {
  const accountId = getAccountId()
  const basePath = objectKey
    ? `${bucket}/${encodeObjectKeyPath(objectKey)}`
    : bucket
  return new URL(`https://${accountId}.r2.cloudflarestorage.com/${basePath}`)
}

const listObjects = async (
  client: AwsClient,
  bucket: string,
  prefix?: string,
  limit?: number,
): Promise<ObjectSummary[]> => {
  const objects: ObjectSummary[] = []
  let continuationToken: string | null = null

  do {
    const url = buildBucketUrl(bucket)
    url.searchParams.set('list-type', '2')
    if (prefix) {
      url.searchParams.set('prefix', prefix)
    }
    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken)
    }

    const response = await client.fetch(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(
        `Failed to list R2 objects (${response.status} ${response.statusText}) in ${bucket}`,
      )
    }

    const xml = await response.text()
    const matches = [
      ...xml.matchAll(
        /<Contents>[\s\S]*?<Key>(.*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/gu,
      ),
    ]

    for (const match of matches) {
      objects.push({
        key:
          match[1]
            ?.replaceAll('&amp;', '&')
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>') ?? '',
        size: Number.parseInt(match[2] ?? '0', 10),
      })

      if (limit !== undefined && objects.length >= limit) {
        return objects
      }
    }

    const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/u)
    continuationToken = tokenMatch?.[1] ?? null
  } while (continuationToken)

  return objects
}

const fetchObject = async (
  client: AwsClient,
  bucket: string,
  objectKey: string,
): Promise<Uint8Array> => {
  const response = await client.fetch(buildBucketUrl(bucket, objectKey), {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${objectKey} (${response.status} ${response.statusText})`,
    )
  }

  return new Uint8Array(await response.arrayBuffer())
}

const putObject = async (
  client: AwsClient,
  bucket: string,
  objectKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> => {
  const response = await client.fetch(buildBucketUrl(bucket, objectKey), {
    method: 'PUT',
    headers: {
      'content-type': contentType,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(
      `Failed to upload ${objectKey} (${response.status} ${response.statusText})`,
    )
  }
}

const ensureParentDir = async (filePath: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true })
}

const listLocalFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listLocalFiles(absolutePath)))
      continue
    }

    files.push(absolutePath)
  }

  return files
}

const inferContentTypeFromKey = (objectKey: string): string => {
  if (objectKey.endsWith(MANIFEST_SUFFIX) || objectKey.endsWith(METADATA_SUFFIX)) {
    return 'application/json; charset=utf-8'
  }
  if (objectKey.endsWith('.jpg') || objectKey.endsWith('.jpeg')) return 'image/jpeg'
  if (objectKey.endsWith('.png')) return 'image/png'
  if (objectKey.endsWith('.webp')) return 'image/webp'
  if (objectKey.endsWith('.gif')) return 'image/gif'
  if (objectKey.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

const isOriginalImageKey = (objectKey: string): boolean =>
  objectKey.startsWith('h/') &&
  !objectKey.endsWith('.raw') &&
  !objectKey.endsWith(MANIFEST_SUFFIX) &&
  !objectKey.endsWith(METADATA_SUFFIX)

const toMetadataPublicId = (objectKey: string): string | null => {
  if (!objectKey.startsWith('h/') || objectKey.endsWith(MANIFEST_SUFFIX)) {
    return null
  }

  const versionedMatch = objectKey.match(/^(.*)\.v\d+\.json$/u)
  if (versionedMatch) {
    return versionedMatch[1] ?? null
  }

  if (objectKey.endsWith(METADATA_SUFFIX)) {
    return objectKey.slice(0, -METADATA_SUFFIX.length)
  }

  return null
}

const toContentTypeFromSharpFormat = (format: string | null): string => {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'png') return 'image/png'
  if (format === 'webp') return 'image/webp'
  if (format === 'gif') return 'image/gif'
  if (format === 'svg') return 'image/svg+xml'
  if (format === 'tiff') return 'image/tiff'
  return 'application/octet-stream'
}

const detectContentTypeFromBody = async (
  body: Uint8Array,
  objectKey: string,
): Promise<string> => {
  const keyedContentType = inferContentTypeFromKey(objectKey)
  if (keyedContentType !== 'application/octet-stream') {
    return keyedContentType
  }

  try {
    const metadata = await sharp(body, {
      animated: false,
      limitInputPixels: false,
    }).metadata()
    return toContentTypeFromSharpFormat(metadata.format ?? null)
  } catch {
    return keyedContentType
  }
}

const normalizeImageBuffer = async (
  sourceBuffer: Uint8Array,
  maxDimension: number,
): Promise<{ body: Uint8Array; info: PreparedImageInfo }> => {
  const source = sharp(sourceBuffer, { animated: false, limitInputPixels: false })
  const metadata = await source.metadata()
  const originalWidth = metadata.width ?? null
  const originalHeight = metadata.height ?? null
  const format = metadata.format ?? null
  const hasExifOrientation = (metadata.orientation ?? 1) !== 1
  const shouldResize =
    !!originalWidth &&
    !!originalHeight &&
    Math.max(originalWidth, originalHeight) > maxDimension

  if (format === 'tiff') {
    let pipeline = sharp(sourceBuffer, {
      animated: false,
      limitInputPixels: false,
    })
      // Apply EXIF orientation before we transcode TIFF originals into the working JPEG.
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })

    pipeline = pipeline.jpeg({ mozjpeg: true, quality: 90 })

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

    return {
      body: new Uint8Array(data),
      info: {
        generatedContentType: 'image/jpeg',
        originalContentType: 'image/tiff',
        originalHeight,
        originalObjectKey: undefined,
        originalPreservedAsRaw: true,
        originalWidth,
        resized: shouldResize,
        transcoded: true,
        uploadedHeight: info.height,
        uploadedWidth: info.width,
      },
    }
  }

  if (
    !originalWidth ||
    !originalHeight ||
    !format ||
    metadata.pages !== undefined
  ) {
    return {
      body: sourceBuffer,
      info: {
        generatedContentType: toContentTypeFromSharpFormat(format),
        originalContentType: toContentTypeFromSharpFormat(format),
        originalHeight,
        originalPreservedAsRaw: false,
        originalWidth,
        resized: false,
        transcoded: false,
        uploadedHeight: originalHeight,
        uploadedWidth: originalWidth,
      },
    }
  }

  if (!shouldResize && !hasExifOrientation) {
    return {
      body: sourceBuffer,
      info: {
        generatedContentType: toContentTypeFromSharpFormat(format),
        originalContentType: toContentTypeFromSharpFormat(format),
        originalHeight,
        originalPreservedAsRaw: false,
        originalWidth,
        resized: false,
        transcoded: false,
        uploadedHeight: originalHeight,
        uploadedWidth: originalWidth,
      },
    }
  }

  const normalizedFormat =
    format === 'jpeg' || format === 'png' || format === 'webp' ? format : null

  if (!normalizedFormat) {
    return {
      body: sourceBuffer,
      info: {
        generatedContentType: toContentTypeFromSharpFormat(format),
        originalContentType: toContentTypeFromSharpFormat(format),
        originalHeight,
        originalPreservedAsRaw: false,
        originalWidth,
        resized: false,
        transcoded: false,
        uploadedHeight: originalHeight,
        uploadedWidth: originalWidth,
      },
    }
  }

  let pipeline = sharp(sourceBuffer, {
    animated: false,
    limitInputPixels: false,
  })
    // Apply EXIF orientation before resizing the working object.
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (normalizedFormat === 'jpeg') {
    pipeline = pipeline.jpeg({ mozjpeg: true, quality: 90 })
  } else if (normalizedFormat === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 })
  } else if (normalizedFormat === 'webp') {
    pipeline = pipeline.webp({ quality: 90 })
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  return {
    body: new Uint8Array(data),
    info: {
      generatedContentType:
        normalizedFormat === 'jpeg'
          ? 'image/jpeg'
          : normalizedFormat === 'png'
            ? 'image/png'
            : 'image/webp',
      originalContentType:
        normalizedFormat === 'jpeg'
          ? 'image/jpeg'
          : normalizedFormat === 'png'
            ? 'image/png'
            : 'image/webp',
      originalHeight,
      originalPreservedAsRaw: false,
      originalWidth,
      resized: true,
      transcoded: false,
      uploadedHeight: info.height,
      uploadedWidth: info.width,
    },
  }
}

const updateMetadataDocument = (
  document: ImageMetadataDocument,
  prepared: PreparedImageInfo | undefined,
  maxDimension: number,
): ImageMetadataDocument => {
  if (!prepared) {
    return document
  }

  const nextMetadata = {
    ...(document.metadata ?? {}),
    ...(prepared.uploadedWidth !== null
      ? { uploadedWidth: String(prepared.uploadedWidth) }
      : {}),
    ...(prepared.uploadedHeight !== null
      ? { uploadedHeight: String(prepared.uploadedHeight) }
      : {}),
    ...(prepared.resized
      ? {
          clientResizeApplied: 'true',
          clientResizeMaxDimension: String(maxDimension),
        }
      : {}),
    ...(prepared.transcoded
      ? {
          workingTranscodeApplied: 'true',
          workingTranscodeSourceFormat: 'tiff',
        }
      : {}),
    ...(prepared.originalPreservedAsRaw && prepared.originalObjectKey
      ? {
          originalObjectKey: prepared.originalObjectKey,
          workingObjectKey:
            prepared.originalObjectKey.endsWith('.raw')
              ? prepared.originalObjectKey.slice(0, -'.raw'.length)
              : prepared.originalObjectKey,
        }
      : {}),
  }

  return {
    ...document,
    originalWidth: document.originalWidth ?? prepared.originalWidth,
    originalHeight: document.originalHeight ?? prepared.originalHeight,
    metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : null,
  }
}

const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        await worker(items[index] as T, index)
      }
    }),
  )
}

const runPrepare = async (
  client: AwsClient,
  options: CliOptions,
): Promise<void> => {
  const objects = await listObjects(
    client,
    options.bucket,
    options.prefix,
    options.limit,
  )
  const originalObjects = objects.filter(object => isOriginalImageKey(object.key))
  const sidecarObjects = objects.filter(object => !isOriginalImageKey(object.key))
  const preparedInfo = new Map<string, PreparedImageInfo>()

  console.log(
    `[r2:normalize] Preparing ${objects.length} objects from ${options.bucket} into ${options.outDir}`,
  )

  await mapWithConcurrency(originalObjects, options.concurrency, async object => {
    const body = await fetchObject(client, options.bucket, object.key)
    const normalized = await normalizeImageBuffer(body, options.maxDimension)

    if (options.onlyFormat === 'tiff' && !normalized.info.transcoded) {
      return
    }

    if (normalized.info.originalPreservedAsRaw) {
      normalized.info.originalObjectKey = `${object.key}.raw`
    }

    preparedInfo.set(object.key, normalized.info)

    const outputPath = path.join(options.outDir, object.key)
    await ensureParentDir(outputPath)
    await writeFile(outputPath, normalized.body)

    if (normalized.info.originalPreservedAsRaw) {
      const rawOutputPath = path.join(options.outDir, `${object.key}.raw`)
      await ensureParentDir(rawOutputPath)
      await writeFile(rawOutputPath, body)
    }

    console.log(
      `[r2:normalize] ${
        normalized.info.transcoded
          ? 'transcoded'
          : normalized.info.resized
            ? 'resized'
            : 'copied'
      } ${object.key}`,
    )
  })

  const preparedPublicIds = new Set(preparedInfo.keys())

  await mapWithConcurrency(sidecarObjects, options.concurrency, async object => {
    const publicId = toMetadataPublicId(object.key)
    if (options.onlyFormat === 'tiff' && (!publicId || !preparedPublicIds.has(publicId))) {
      return
    }

    const body = await fetchObject(client, options.bucket, object.key)
    let output = body

    if (object.key.endsWith(METADATA_SUFFIX) && !object.key.endsWith(MANIFEST_SUFFIX)) {
      const publicId = toMetadataPublicId(object.key)
      const prepared = publicId ? preparedInfo.get(publicId) : undefined

      if (prepared) {
        const document = JSON.parse(Buffer.from(body).toString('utf8')) as ImageMetadataDocument
        output = new TextEncoder().encode(
          `${JSON.stringify(
            updateMetadataDocument(document, prepared, options.maxDimension),
            null,
            2,
          )}\n`,
        )
      }
    }

    const outputPath = path.join(options.outDir, object.key)
    await ensureParentDir(outputPath)
    await writeFile(outputPath, output)
  })

  console.log(
    `[r2:normalize] Complete. Prepared ${originalObjects.length} originals and ${sidecarObjects.length} sidecars.`,
  )
}

const runSync = async (client: AwsClient, options: CliOptions): Promise<void> => {
  if (!existsSync(options.outDir)) {
    throw new Error(`Prepared output directory does not exist: ${options.outDir}`)
  }

  const allFiles = (await listLocalFiles(options.outDir)).filter(
    filePath => !filePath.endsWith('.raw.raw'),
  )
  const files = options.prefix
    ? allFiles.filter(filePath => {
        const relativePath = path
          .relative(options.outDir, filePath)
          .split(path.sep)
          .join('/')
        return relativePath.startsWith(options.prefix ?? '')
      })
    : allFiles
  console.log(
    `[r2:normalize] Syncing ${files.length} prepared files from ${options.outDir} to ${options.bucket}`,
  )

  await mapWithConcurrency(files, options.concurrency, async filePath => {
    const relativePath = path.relative(options.outDir, filePath).split(path.sep).join('/')
    const body = new Uint8Array(await readFile(filePath))
    const contentType = await detectContentTypeFromBody(body, relativePath)
    await putObject(
      client,
      options.bucket,
      relativePath,
      body,
      contentType,
    )
    console.log(`[r2:normalize] uploaded ${relativePath}`)
  })

  console.log('[r2:normalize] Sync complete.')
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.stage)
  const client = createR2Client()

  if (options.mode === 'prepare') {
    await runPrepare(client, options)
    return
  }

  await runSync(client, options)
}

await main()
