import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Stage = 'local' | 'preview' | 'production'

type CliOptions = {
  limit?: number
  outPath: string
  prefix?: string
  sourceBucket: string
  stage: Stage
  targetBucket: string
  write: boolean
}

type ObjectSummary = {
  key: string
  size: number
}

type CopyPlanEntry = {
  sourceKey: string
  targetKey: string
  size: number
  skipped: boolean
  reason?: string
}

type CopyReport = {
  generatedAt: string
  stage: Stage
  sourceBucket: string
  targetBucket: string
  prefix: string | null
  write: boolean
  summary: {
    scanned: number
    planned: number
    copied: number
    skipped: number
  }
  entries: CopyPlanEntry[]
}

const DEFAULT_SOURCE_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-images-local',
  preview: 'hype-images-preview',
  production: 'hype-images-production',
}

const DEFAULT_TARGET_BUCKET_BY_STAGE: Record<Stage, string> = {
  local: 'hype-assets-raw-dev',
  preview: 'hype-assets-raw-preview',
  production: 'hype-assets-raw-prod',
}

const DEFAULT_OUT_PATH = 'tmp/r2-image-asset-raw-migration-report.json'

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
    outPath: DEFAULT_OUT_PATH,
    stage: 'production',
    write: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--stage':
        options.stage = argv[index + 1] as Stage
        index += 1
        break
      case '--source-bucket':
        options.sourceBucket = argv[index + 1]
        index += 1
        break
      case '--target-bucket':
        options.targetBucket = argv[index + 1]
        index += 1
        break
      case '--prefix':
        options.prefix = argv[index + 1]
        index += 1
        break
      case '--limit':
        options.limit = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--out':
        options.outPath = argv[index + 1]
        index += 1
        break
      case '--write':
        options.write = true
        break
      default:
        break
    }
  }

  const stage = options.stage ?? 'production'

  if (stage !== 'local' && stage !== 'preview' && stage !== 'production') {
    throw new Error(`Invalid --stage value: ${String(stage)}`)
  }

  return {
    outPath: options.outPath ?? DEFAULT_OUT_PATH,
    sourceBucket:
      options.sourceBucket ?? DEFAULT_SOURCE_BUCKET_BY_STAGE[stage],
    stage,
    targetBucket:
      options.targetBucket ?? DEFAULT_TARGET_BUCKET_BY_STAGE[stage],
    write: options.write ?? false,
    ...(options.prefix ? { prefix: options.prefix } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
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
    const keyMatches = [...xml.matchAll(/<Contents>[\s\S]*?<Key>(.*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/gu)]
    for (const match of keyMatches) {
      objects.push({
        key: match[1]
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

const toTargetKey = (sourceKey: string): CopyPlanEntry => {
  if (sourceKey.startsWith('h/')) {
    return {
      sourceKey,
      targetKey: sourceKey,
      size: 0,
      skipped: true,
      reason: 'already-namespaced',
    }
  }

  return {
    sourceKey,
    targetKey: `h/${sourceKey}`,
    size: 0,
    skipped: false,
  }
}

const headObject = async (
  client: AwsClient,
  bucket: string,
  objectKey: string,
): Promise<Response> =>
  await client.fetch(buildBucketUrl(bucket, objectKey), {
    method: 'HEAD',
  })

const copyObject = async (
  client: AwsClient,
  sourceBucket: string,
  targetBucket: string,
  sourceKey: string,
  targetKey: string,
): Promise<void> => {
  const sourceResponse = await client.fetch(buildBucketUrl(sourceBucket, sourceKey), {
    method: 'GET',
  })

  if (!sourceResponse.ok) {
    throw new Error(
      `Failed to read ${sourceBucket}/${sourceKey} (${sourceResponse.status} ${sourceResponse.statusText})`,
    )
  }

  const body = await sourceResponse.arrayBuffer()
  const contentType =
    sourceResponse.headers.get('content-type') ?? 'application/octet-stream'
  const cacheControl = sourceResponse.headers.get('cache-control')

  const putResponse = await client.fetch(buildBucketUrl(targetBucket, targetKey), {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      ...(cacheControl ? { 'cache-control': cacheControl } : {}),
    },
    body,
  })

  if (!putResponse.ok) {
    throw new Error(
      `Failed to write ${targetBucket}/${targetKey} (${putResponse.status} ${putResponse.statusText})`,
    )
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.stage)

  const client = createR2Client()
  const listedObjects = await listObjects(
    client,
    options.sourceBucket,
    options.prefix,
    options.limit,
  )

  const entries: CopyPlanEntry[] = []
  let copied = 0
  let skipped = 0

  for (const object of listedObjects) {
    const plan = toTargetKey(object.key)
    plan.size = object.size

    if (plan.skipped) {
      skipped += 1
      entries.push(plan)
      continue
    }

    const targetExists = await headObject(client, options.targetBucket, plan.targetKey)
    if (targetExists.ok) {
      skipped += 1
      entries.push({
        ...plan,
        skipped: true,
        reason: 'target-exists',
      })
      continue
    }

    if (options.write) {
      await copyObject(
        client,
        options.sourceBucket,
        options.targetBucket,
        plan.sourceKey,
        plan.targetKey,
      )
      copied += 1
    }

    entries.push(plan)
  }

  const report: CopyReport = {
    generatedAt: new Date().toISOString(),
    stage: options.stage,
    sourceBucket: options.sourceBucket,
    targetBucket: options.targetBucket,
    prefix: options.prefix ?? null,
    write: options.write,
    summary: {
      scanned: listedObjects.length,
      planned: entries.filter(entry => !entry.skipped).length,
      copied,
      skipped,
    },
    entries,
  }

  await mkdir(path.dirname(options.outPath), { recursive: true })
  await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        ok: true,
        reportPath: options.outPath,
        summary: report.summary,
      },
      null,
      2,
    ),
  )
}

await main()
