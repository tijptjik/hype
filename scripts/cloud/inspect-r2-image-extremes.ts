import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'

type Stage = 'local' | 'preview' | 'production'

type CliOptions = {
  bucket: string
  largestCount: number
  metadataConcurrency: number
  metadataPrefix?: string
  prefix?: string
  stage: Stage
  thresholdMegapixels: number
}

type ObjectSummary = {
  key: string
  size: number
}

type ImageMetadataDocument = {
  originalHeight?: number | null
  originalWidth?: number | null
}

type MetadataSidecarCandidate = {
  key: string
  publicId: string
  version: number | null
}

type MetadataMeasurement = {
  key: string
  megapixels: number
  originalHeight: number
  originalWidth: number
  publicId: string
  version: number | null
}

const DEFAULT_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const DEFAULT_THRESHOLD_MEGAPIXELS = 6

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
// - readJsonObject
//
// 4. METADATA
// - isImageObjectKey
// - toMetadataCandidate
// - preferMetadataCandidate
// - toMetadataCandidates
// - fetchMetadataMeasurement
// - mapWithConcurrency
//
// 5. REPORTING
// - formatBytes
// - printLargestObjects
// - printMetadataExtremes
//
// 6. ENTRYPOINT
// - main
// ---

/**
 * Loads a dotenv-style file into the current process when variables are unset.
 *
 * @param filePath Path to the env file.
 * @returns Nothing.
 */
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

/**
 * Loads the local R2 credentials used by the existing cloud scripts.
 *
 * @param stage Stage to inspect.
 * @returns Nothing.
 */
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

/**
 * Builds an S3-compatible client for Cloudflare R2.
 *
 * @returns Authenticated client.
 */
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

/**
 * Reads the Cloudflare account id required for R2 API URLs.
 *
 * @returns Account id string.
 */
const getAccountId = (): string => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID')
  }

  return accountId
}

/**
 * Parses CLI flags for the bucket inspection command.
 *
 * @param argv Raw process args after the script name.
 * @returns Normalized options.
 */
const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    largestCount: 10,
    metadataConcurrency: 8,
    stage: 'production',
    thresholdMegapixels: DEFAULT_THRESHOLD_MEGAPIXELS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--stage':
        options.stage = argv[index + 1] as Stage
        index += 1
        break
      case '--bucket':
        options.bucket = argv[index + 1]
        index += 1
        break
      case '--prefix':
        options.prefix = argv[index + 1]
        index += 1
        break
      case '--metadata-prefix':
        options.metadataPrefix = argv[index + 1]
        index += 1
        break
      case '--largest-count':
        options.largestCount = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--metadata-concurrency':
        options.metadataConcurrency = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--threshold-megapixels':
        options.thresholdMegapixels = Number.parseFloat(argv[index + 1] ?? '')
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

  const largestCount = options.largestCount ?? 10
  if (!Number.isInteger(largestCount) || largestCount <= 0) {
    throw new Error(`Invalid --largest-count value: ${String(options.largestCount)}`)
  }

  const metadataConcurrency = options.metadataConcurrency ?? 8
  if (!Number.isInteger(metadataConcurrency) || metadataConcurrency <= 0) {
    throw new Error(
      `Invalid --metadata-concurrency value: ${String(options.metadataConcurrency)}`,
    )
  }

  const thresholdMegapixels =
    options.thresholdMegapixels ?? DEFAULT_THRESHOLD_MEGAPIXELS
  if (!Number.isFinite(thresholdMegapixels) || thresholdMegapixels <= 0) {
    throw new Error(
      `Invalid --threshold-megapixels value: ${String(options.thresholdMegapixels)}`,
    )
  }

  return {
    bucket: options.bucket ?? DEFAULT_BUCKET_BY_STAGE[stage],
    largestCount,
    metadataConcurrency,
    stage,
    thresholdMegapixels,
    ...(options.prefix ? { prefix: options.prefix } : {}),
    ...(options.metadataPrefix ? { metadataPrefix: options.metadataPrefix } : {}),
  }
}

/**
 * Escapes an object key for a path-based R2 API URL.
 *
 * @param objectKey Raw object key.
 * @returns URL-safe key path.
 */
const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

/**
 * Builds the R2 REST URL for a bucket or object.
 *
 * @param bucket Bucket name.
 * @param objectKey Optional object key.
 * @returns Absolute URL.
 */
const buildBucketUrl = (bucket: string, objectKey?: string): URL => {
  const accountId = getAccountId()
  const basePath = objectKey
    ? `${bucket}/${encodeObjectKeyPath(objectKey)}`
    : bucket
  return new URL(`https://${accountId}.r2.cloudflarestorage.com/${basePath}`)
}

/**
 * Lists every object under the selected bucket/prefix.
 *
 * @param client Authenticated R2 client.
 * @param bucket Bucket name.
 * @param prefix Optional key prefix.
 * @returns Flat object summaries.
 */
const listObjects = async (
  client: AwsClient,
  bucket: string,
  prefix?: string,
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
    const keyMatches = [
      ...xml.matchAll(
        /<Contents>[\s\S]*?<Key>(.*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/gu,
      ),
    ]

    for (const match of keyMatches) {
      objects.push({
        key:
          match[1]
            ?.replaceAll('&amp;', '&')
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>') ?? '',
        size: Number.parseInt(match[2] ?? '0', 10),
      })
    }

    const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/u)
    continuationToken = tokenMatch?.[1] ?? null
  } while (continuationToken)

  return objects
}

/**
 * Reads a JSON object from R2 without writing it to disk.
 *
 * @param client Authenticated R2 client.
 * @param bucket Bucket name.
 * @param objectKey Object key.
 * @returns Parsed JSON document or null when missing.
 */
const readJsonObject = async <T>(
  client: AwsClient,
  bucket: string,
  objectKey: string,
): Promise<T | null> => {
  const response = await client.fetch(buildBucketUrl(bucket, objectKey), {
    method: 'GET',
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Failed to read ${objectKey} (${response.status} ${response.statusText})`,
    )
  }

  return (await response.json()) as T
}

/**
 * Filters to original image objects rather than metadata or manifests.
 *
 * @param key R2 object key.
 * @returns Whether the key looks like a raw image object.
 */
const isImageObjectKey = (key: string): boolean =>
  key.startsWith('h/') && !key.endsWith('.json') && !key.endsWith('.manifest.json')

/**
 * Parses a metadata sidecar key into its stable public id and optional version.
 *
 * @param key R2 object key.
 * @returns Metadata candidate or null when the key is not a metadata sidecar.
 */
const toMetadataCandidate = (key: string): MetadataSidecarCandidate | null => {
  if (!key.startsWith('h/') || key.endsWith('.manifest.json') || !key.endsWith('.json')) {
    return null
  }

  const versionedMatch = key.match(/^(.*)\.v(\d+)\.json$/u)
  if (versionedMatch) {
    return {
      key,
      publicId: versionedMatch[1] ?? '',
      version: Number.parseInt(versionedMatch[2] ?? '', 10),
    }
  }

  return {
    key,
    publicId: key.slice(0, -'.json'.length),
    version: null,
  }
}

/**
 * Chooses the most specific metadata sidecar for a public id.
 *
 * @param current Existing candidate.
 * @param next Newly discovered candidate.
 * @returns Preferred candidate.
 */
const preferMetadataCandidate = (
  current: MetadataSidecarCandidate | undefined,
  next: MetadataSidecarCandidate,
): MetadataSidecarCandidate => {
  if (!current) {
    return next
  }

  if (current.version === null && next.version !== null) {
    return next
  }

  if (current.version !== null && next.version !== null && next.version > current.version) {
    return next
  }

  return current
}

/**
 * Deduplicates metadata sidecars to the latest version per public id.
 *
 * @param objects Bucket listing.
 * @param prefix Optional metadata prefix override.
 * @returns Unique sidecar candidates.
 */
const toMetadataCandidates = (
  objects: ObjectSummary[],
  prefix?: string,
): MetadataSidecarCandidate[] => {
  const byPublicId = new Map<string, MetadataSidecarCandidate>()

  for (const object of objects) {
    const candidate = toMetadataCandidate(object.key)
    if (!candidate) continue
    if (prefix && !candidate.publicId.startsWith(prefix)) continue
    byPublicId.set(
      candidate.publicId,
      preferMetadataCandidate(byPublicId.get(candidate.publicId), candidate),
    )
  }

  return [...byPublicId.values()]
}

/**
 * Loads width/height metadata and converts it to megapixels.
 *
 * @param client Authenticated R2 client.
 * @param bucket Bucket name.
 * @param candidate Metadata object key.
 * @returns Parsed measurement or null when dimensions are unavailable.
 */
const fetchMetadataMeasurement = async (
  client: AwsClient,
  bucket: string,
  candidate: MetadataSidecarCandidate,
): Promise<MetadataMeasurement | null> => {
  const document = await readJsonObject<ImageMetadataDocument>(
    client,
    bucket,
    candidate.key,
  )
  const originalWidth = document?.originalWidth
  const originalHeight = document?.originalHeight

  if (
    typeof originalWidth !== 'number' ||
    typeof originalHeight !== 'number' ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return null
  }

  return {
    key: candidate.key,
    megapixels: (originalWidth * originalHeight) / 1_000_000,
    originalHeight,
    originalWidth,
    publicId: candidate.publicId,
    version: candidate.version,
  }
}

/**
 * Runs a mapper with bounded concurrency.
 *
 * @param items Work items.
 * @param concurrency Max parallel operations.
 * @param mapper Async mapping function.
 * @returns Mapped results in input order.
 */
const mapWithConcurrency = async <T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> => {
  const results = new Array<U>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index] as T, index)
      }
    }),
  )

  return results
}

/**
 * Formats byte counts for console output.
 *
 * @param bytes Raw byte count.
 * @returns Human-readable string.
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/**
 * Prints the largest raw objects by stored byte size.
 *
 * @param objects Bucket objects.
 * @param largestCount Number of rows to print.
 * @returns Nothing.
 */
const printLargestObjects = (
  objects: ObjectSummary[],
  largestCount: number,
): void => {
  const largest = objects
    .filter(object => isImageObjectKey(object.key))
    .sort((left, right) => right.size - left.size)
    .slice(0, largestCount)

  console.log(`Largest raw objects (${largest.length})`)
  for (const object of largest) {
    console.log(`- ${formatBytes(object.size)}\t${object.key}`)
  }
}

/**
 * Prints the highest-megapixel image and the best image below the low-memory threshold.
 *
 * @param measurements Metadata-derived image measurements.
 * @param thresholdMegapixels Low-memory threshold.
 * @returns Nothing.
 */
const printMetadataExtremes = (
  measurements: MetadataMeasurement[],
  thresholdMegapixels: number,
): void => {
  if (measurements.length === 0) {
    console.log('No metadata sidecars with originalWidth/originalHeight were found.')
    return
  }

  const largestByMegapixels = measurements
    .slice()
    .sort((left, right) => right.megapixels - left.megapixels)[0]

  const belowThreshold = measurements
    .filter(item => item.megapixels < thresholdMegapixels)
    .sort(
      (left, right) =>
        Math.abs(thresholdMegapixels - left.megapixels) -
        Math.abs(thresholdMegapixels - right.megapixels),
    )[0]

  const aboveThreshold = measurements
    .filter(item => item.megapixels >= thresholdMegapixels)
    .sort(
      (left, right) =>
        Math.abs(thresholdMegapixels - left.megapixels) -
        Math.abs(thresholdMegapixels - right.megapixels),
    )[0]

  console.log('')
  console.log('Largest by metadata megapixels')
  console.log(
    `- ${largestByMegapixels?.megapixels.toFixed(2)} MP\t${largestByMegapixels?.originalWidth}x${largestByMegapixels?.originalHeight}\t${largestByMegapixels?.publicId}`,
  )

  console.log('')
  console.log(`Closest below ${thresholdMegapixels.toFixed(2)} MP`)
  if (belowThreshold) {
    console.log(
      `- ${belowThreshold.megapixels.toFixed(2)} MP\t${belowThreshold.originalWidth}x${belowThreshold.originalHeight}\t${belowThreshold.publicId}`,
    )
  } else {
    console.log('- none')
  }

  console.log('')
  console.log(`Closest at/above ${thresholdMegapixels.toFixed(2)} MP`)
  if (aboveThreshold) {
    console.log(
      `- ${aboveThreshold.megapixels.toFixed(2)} MP\t${aboveThreshold.originalWidth}x${aboveThreshold.originalHeight}\t${aboveThreshold.publicId}`,
    )
  } else {
    console.log('- none')
  }
}

/**
 * Lists the bucket and prints the extreme objects and metadata thresholds.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.stage)

  const client = createR2Client()
  console.log(
    `[r2:inspect] Listing ${options.bucket}${options.prefix ? ` prefix=${options.prefix}` : ''}`,
  )

  const objects = await listObjects(client, options.bucket, options.prefix)
  console.log(`[r2:inspect] Scanned ${objects.length} objects`)
  printLargestObjects(objects, options.largestCount)

  const metadataCandidates = toMetadataCandidates(
    objects,
    options.metadataPrefix ?? options.prefix,
  )
  console.log(
    `[r2:inspect] Inspecting ${metadataCandidates.length} metadata sidecars with concurrency=${options.metadataConcurrency}`,
  )

  const measurements = (
    await mapWithConcurrency(
      metadataCandidates,
      options.metadataConcurrency,
      async candidate =>
        await fetchMetadataMeasurement(client, options.bucket, candidate),
    )
  ).filter((item): item is MetadataMeasurement => item !== null)

  printMetadataExtremes(measurements, options.thresholdMegapixels)
}

await main()
