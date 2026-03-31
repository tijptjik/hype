import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

type Stage = 'local' | 'preview' | 'production'
type FixtureFormat = 'avif' | 'jpeg' | 'png' | 'webp'

type CliOptions = {
  fitMode: 'cover' | 'inside'
  keyPrefix: string
  maxDimension: number
  sourceFile: string
  stage: Stage
}

type FixtureSpec = {
  contentType: string
  format: FixtureFormat
  label: string
}

const DEFAULT_SOURCE_FILE = 'scripts/data/images-to-upload/8jMFSq-e94BH.jpg'
const DEFAULT_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const FIXTURE_SPECS: FixtureSpec[] = [
  {
    contentType: 'image/jpeg',
    format: 'jpeg',
    label: 'jpeg-max',
  },
  {
    contentType: 'image/png',
    format: 'png',
    label: 'png-max',
  },
  {
    contentType: 'image/webp',
    format: 'webp',
    label: 'webp-max',
  },
  {
    contentType: 'image/avif',
    format: 'avif',
    label: 'avif-max',
  },
  {
    contentType: 'image/jpeg',
    format: 'jpeg',
    label: 'tiff-as-jpeg',
  },
]

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
 * Loads the local R2 credentials used by the cloud scripts.
 *
 * @param stage Stage to target.
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
 * Parses CLI flags.
 *
 * @param argv Raw process args after the script path.
 * @returns Normalized options.
 */
const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    fitMode: 'cover',
    keyPrefix: 'h/debug-memory/probes',
    maxDimension: 2048,
    sourceFile: DEFAULT_SOURCE_FILE,
    stage: 'preview',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--key-prefix':
        options.keyPrefix = argv[index + 1]
        index += 1
        break
      case '--fit-mode':
        options.fitMode = argv[index + 1] as 'cover' | 'inside'
        index += 1
        break
      case '--max-dimension':
        options.maxDimension = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--source-file':
        options.sourceFile = argv[index + 1]
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

  const stage = options.stage ?? 'preview'
  if (stage !== 'local' && stage !== 'preview' && stage !== 'production') {
    throw new Error(`Invalid --stage value: ${String(stage)}`)
  }

  const maxDimension = options.maxDimension ?? 2048
  if (!Number.isInteger(maxDimension) || maxDimension <= 0) {
    throw new Error(
      `Invalid --max-dimension value: ${String(options.maxDimension)}`,
    )
  }

  const fitMode = options.fitMode ?? 'cover'
  if (fitMode !== 'cover' && fitMode !== 'inside') {
    throw new Error(`Invalid --fit-mode value: ${String(options.fitMode)}`)
  }

  const sourceFile = options.sourceFile ?? DEFAULT_SOURCE_FILE
  if (!existsSync(sourceFile)) {
    throw new Error(`Source file does not exist: ${sourceFile}`)
  }

  return {
    fitMode,
    keyPrefix: (options.keyPrefix ?? 'h/debug-memory/probes').replace(/\/+$/, ''),
    maxDimension,
    sourceFile,
    stage,
  }
}

/**
 * Creates an authenticated R2 API client.
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
 * @returns Account id.
 */
const getAccountId = (): string => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID')
  }
  return accountId
}

/**
 * Escapes an object key for a path-based R2 API URL.
 *
 * @param objectKey Raw key.
 * @returns URL-safe key path.
 */
const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

/**
 * Builds the R2 REST URL for one object.
 *
 * @param bucket Bucket name.
 * @param objectKey Object key.
 * @returns Absolute URL.
 */
const buildBucketUrl = (bucket: string, objectKey: string): URL =>
  new URL(
    `https://${getAccountId()}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKeyPath(objectKey)}`,
  )

/**
 * Uploads one generated probe fixture.
 *
 * @param client Authenticated R2 client.
 * @param bucket Bucket name.
 * @param objectKey Target object key.
 * @param body Encoded bytes.
 * @param contentType HTTP content type.
 * @returns Nothing.
 */
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

/**
 * Builds a resized fixture in the requested encoded format.
 *
 * @param sourceFile Local source file path.
 * @param maxDimension Max width/height.
 * @param spec Target fixture format.
 * @returns Encoded buffer and dimensions.
 */
const buildFixture = async (
  sourceFile: string,
  maxDimension: number,
  fitMode: 'cover' | 'inside',
  spec: FixtureSpec,
): Promise<{ body: Uint8Array; height: number; width: number }> => {
  let pipeline = sharp(sourceFile, {
    animated: false,
    limitInputPixels: false,
  }).resize({
    width: maxDimension,
    height: maxDimension,
    fit: fitMode,
    position: 'centre',
    withoutEnlargement: true,
  })

  if (spec.format === 'jpeg') {
    pipeline = pipeline.jpeg({ mozjpeg: true, quality: 90 })
  } else if (spec.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 })
  } else if (spec.format === 'webp') {
    pipeline = pipeline.webp({ quality: 90 })
  } else if (spec.format === 'avif') {
    pipeline = pipeline.avif({ quality: 55 })
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  return {
    body: new Uint8Array(data),
    height: info.height,
    width: info.width,
  }
}

/**
 * Stages the standard probe fixture set into the target raw bucket.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.stage)
  const client = createR2Client()
  const bucket = DEFAULT_BUCKET_BY_STAGE[options.stage]
  const sourceBaseName = path.basename(options.sourceFile, path.extname(options.sourceFile))

  console.log(
    JSON.stringify(
      {
        event: 'stage-asset-worker-probe-fixtures',
        bucket,
        fitMode: options.fitMode,
        keyPrefix: options.keyPrefix,
        maxDimension: options.maxDimension,
        sourceFile: options.sourceFile,
      },
      null,
      2,
    ),
  )

  for (const spec of FIXTURE_SPECS) {
    const fixture = await buildFixture(
      options.sourceFile,
      options.maxDimension,
      options.fitMode,
      spec,
    )
    // The worker strips known extensions from request public ids before raw lookup,
    // so probe fixtures must be stored under extensionless canonical keys.
    const objectKey = `${options.keyPrefix}/${sourceBaseName}-${spec.label}`

    await putObject(client, bucket, objectKey, fixture.body, spec.contentType)

    console.log(
      JSON.stringify(
        {
          label: spec.label,
          contentType: spec.contentType,
          objectKey,
          width: fixture.width,
          height: fixture.height,
          bytes: fixture.body.byteLength,
        },
        null,
        2,
      ),
    )
  }
}

await main()
