import { AwsClient } from 'aws4fetch'
import { existsSync } from 'node:fs'

type Stage = 'local' | 'preview' | 'production'

type CliOptions = {
  bucket: string
  prefix?: string
  stage: Stage
}

const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--bucket':
        options.bucket = argv[index + 1]
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
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!options.bucket) {
    throw new Error('Expected --bucket <name>')
  }

  if (
    options.stage &&
    options.stage !== 'local' &&
    options.stage !== 'preview' &&
    options.stage !== 'production'
  ) {
    throw new Error(`Unsupported --stage value: ${options.stage}`)
  }

  return {
    bucket: options.bucket,
    ...(options.prefix ? { prefix: options.prefix } : {}),
    stage: options.stage ?? 'local',
  }
}

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

const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const createClient = (): { client: AwsClient; accountId: string } => {
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
      service: 's3',
      region: 'auto',
    }),
  }
}

const listKeys = async (params: {
  client: AwsClient
  accountId: string
  bucket: string
  prefix?: string
}): Promise<string[]> => {
  const keys: string[] = []
  let continuationToken = ''

  while (true) {
    const url = new URL(
      `https://${params.accountId}.r2.cloudflarestorage.com/${params.bucket}`,
    )
    url.searchParams.set('list-type', '2')

    if (params.prefix) {
      url.searchParams.set('prefix', params.prefix)
    }

    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken)
    }

    const response = await params.client.fetch(url)
    const body = await response.text()

    if (!response.ok) {
      throw new Error(
        `${params.bucket}: list failed ${response.status} ${response.statusText}`,
      )
    }

    keys.push(
      ...[...body.matchAll(/<Key>([^<]+)<\/Key>/g)].map(match => match[1] ?? ''),
    )

    continuationToken =
      body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? ''

    if (!continuationToken) {
      return keys.filter(Boolean)
    }
  }
}

const deleteKey = async (params: {
  client: AwsClient
  accountId: string
  bucket: string
  key: string
}): Promise<void> => {
  const url = `https://${params.accountId}.r2.cloudflarestorage.com/${params.bucket}/${encodeObjectKeyPath(params.key)}`
  const response = await params.client.fetch(url, { method: 'DELETE' })

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `${params.bucket}: delete failed ${params.key} ${response.status} ${await response.text()}`,
    )
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  await loadLocalEnvForStage(options.stage)
  const { client, accountId } = createClient()
  const keys = await listKeys({
    client,
    accountId,
    bucket: options.bucket,
    prefix: options.prefix,
  })

  console.log(
    JSON.stringify({
      bucket: options.bucket,
      prefix: options.prefix ?? null,
      matched: keys.length,
    }),
  )

  let deleted = 0
  for (const key of keys) {
    await deleteKey({
      client,
      accountId,
      bucket: options.bucket,
      key,
    })
    deleted += 1

    if (deleted % 250 === 0) {
      console.log(
        JSON.stringify({
          bucket: options.bucket,
          prefix: options.prefix ?? null,
          deleted,
        }),
      )
    }
  }

  console.log(
    JSON.stringify({
      bucket: options.bucket,
      prefix: options.prefix ?? null,
      deleted,
      emptied: true,
    }),
  )
}

await main()
