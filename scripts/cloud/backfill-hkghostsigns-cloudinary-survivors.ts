import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

type Stage = 'production'

type SurvivorTarget = {
  id: string
  publicId: string
  version: number
}

type CliOptions = {
  downloadDir: string
  stage: Stage
  targetBucket: string
  warm: boolean
  write: boolean
}

type UploadResult = {
  contentType: string
  key: string
  size: number
}

const CLOUDINARY_CLOUD_NAME = 'dg6vtsga1'
const DEFAULT_DOWNLOAD_DIR = 'tmp/hkghostsigns-cloudinary-survivors'
const DEFAULT_TARGET_BUCKET = 'hype-assets-raw-prod'
const ASSET_BASE_URL = 'https://assets.hype.hk'

const TARGETS: SurvivorTarget[] = [
  {
    id: '-2hdzuT4PPWs',
    publicId: 'h/hkghostsigns/hkghostsigns/qutosf9babho4z52rty5',
    version: 1774499916,
  },
  {
    id: '_tnyy6Tqcc-5',
    publicId: 'h/hkghostsigns/hkghostsigns/ehgai07gz70cqmpu9d48',
    version: 1774499919,
  },
  {
    id: 'EwC2kkxvu9cX',
    publicId: 'h/hkghostsigns/hkghostsigns/bskgeldcxxjbyiuegrzr',
    version: 1774499922,
  },
  {
    id: 'oDZHWN9wlVYb',
    publicId: 'h/hkghostsigns/hkghostsigns/ebdk4mafjxeq0e2cg2vh',
    version: 1774583999,
  },
  {
    id: 'zvl3tx9c6UU2',
    publicId: 'h/hkghostsigns/hkghostsigns/n8djzjzuvknfkcozomqi',
    version: 1774584003,
  },
]

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

const loadLocalEnvForProduction = async (): Promise<void> => {
  await loadEnvFile('.dev.vars')
  await loadEnvFile('.dev.vars.production')
}

/**
 * Parses the CLI flags for this targeted survivor backfill.
 *
 * @param argv Raw args after the script path.
 * @returns Normalized options.
 */
const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    downloadDir: DEFAULT_DOWNLOAD_DIR,
    stage: 'production',
    targetBucket: DEFAULT_TARGET_BUCKET,
    warm: true,
    write: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--download-dir':
        options.downloadDir = argv[index + 1] ?? options.downloadDir
        index += 1
        break
      case '--target-bucket':
        options.targetBucket = argv[index + 1] ?? options.targetBucket
        index += 1
        break
      case '--no-warm':
        options.warm = false
        break
      case '--write':
        options.write = true
        break
      default:
        break
    }
  }

  return {
    downloadDir: options.downloadDir ?? DEFAULT_DOWNLOAD_DIR,
    stage: 'production',
    targetBucket: options.targetBucket ?? DEFAULT_TARGET_BUCKET,
    warm: options.warm ?? true,
    write: options.write ?? false,
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

const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const buildBucketUrl = (bucket: string, objectKey: string): URL =>
  new URL(
    `https://${getAccountId()}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKeyPath(objectKey)}`,
  )

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
      `Failed to upload ${bucket}/${objectKey} (${response.status} ${response.statusText})`,
    )
  }
}

const toCloudinaryUrl = (target: SurvivorTarget): string =>
  `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/v${target.version}/${target.publicId.slice(2)}`

const downloadOriginal = async (target: SurvivorTarget): Promise<Uint8Array> => {
  const response = await fetch(toCloudinaryUrl(target), {
    method: 'GET',
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(
      `Failed to download ${target.id} from Cloudinary (${response.status} ${response.statusText})`,
    )
  }

  return new Uint8Array(await response.arrayBuffer())
}

const normalizeWorkingImage = async (
  sourceBuffer: Uint8Array,
): Promise<{ body: Uint8Array; contentType: string }> => {
  const metadata = await sharp(sourceBuffer, {
    animated: false,
    limitInputPixels: false,
  }).metadata()

  const format = metadata.format ?? 'jpeg'
  const pipeline = sharp(sourceBuffer, {
    animated: false,
    limitInputPixels: false,
  })
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (format === 'png') {
    const { data } = await pipeline
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })
    return { body: new Uint8Array(data), contentType: 'image/png' }
  }

  if (format === 'webp') {
    const { data } = await pipeline
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true })
    return { body: new Uint8Array(data), contentType: 'image/webp' }
  }

  const { data } = await pipeline
    .jpeg({ mozjpeg: true, quality: 90 })
    .toBuffer({ resolveWithObject: true })
  return { body: new Uint8Array(data), contentType: 'image/jpeg' }
}

const warmTarget = async (target: SurvivorTarget): Promise<void> => {
  const urls = [
    `${ASSET_BASE_URL}/image/raw/h_2048,w_2048/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fill,h_256,w_256/g_auto/f_jpeg/q_auto/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fill,h_128,w_128/g_auto/f_webp/q_auto/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fill,h_128,w_128/g_auto/f_jpeg/q_auto/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fit,h_1024,w_1024/g_auto/f_webp/q_auto/v${target.version}/${target.publicId}`,
    `${ASSET_BASE_URL}/image/upload/c_fit,h_1024,w_1024/g_auto/f_jpeg/q_auto/v${target.version}/${target.publicId}`,
  ]

  for (const url of urls) {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        accept: 'image/webp,image/jpeg,image/*;q=0.9,*/*;q=0.8',
      },
    })

    console.log(
      `[warm] id=${target.id} status=${response.status} url=${url}`,
    )
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForProduction()
  await mkdir(options.downloadDir, { recursive: true })

  const client = createR2Client()

  for (const target of TARGETS) {
    console.log(
      `[backfill] processing id=${target.id} publicId=${target.publicId} version=${target.version}`,
    )

    const originalBody = await downloadOriginal(target)
    const working = await normalizeWorkingImage(originalBody)

    const rawPath = path.join(options.downloadDir, `${target.id}.raw.jpg`)
    const workingPath = path.join(options.downloadDir, `${target.id}.jpg`)
    await writeFile(rawPath, originalBody)
    await writeFile(workingPath, working.body)

    const rawStats = await stat(rawPath)
    const workingStats = await stat(workingPath)

    const uploadPlan: UploadResult[] = [
      {
        key: `${target.publicId}.raw`,
        contentType: 'image/jpeg',
        size: rawStats.size,
      },
      {
        key: target.publicId,
        contentType: working.contentType,
        size: workingStats.size,
      },
    ]

    for (const entry of uploadPlan) {
      console.log(
        `[backfill] ${options.write ? 'upload' : 'plan'} key=${entry.key} bytes=${entry.size} contentType=${entry.contentType}`,
      )
    }

    if (options.write) {
      await putObject(
        client,
        options.targetBucket,
        `${target.publicId}.raw`,
        originalBody,
        'image/jpeg',
      )
      await putObject(
        client,
        options.targetBucket,
        target.publicId,
        working.body,
        working.contentType,
      )
    }

    if (options.write && options.warm) {
      await warmTarget(target)
    }
  }
}

await main()
