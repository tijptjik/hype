import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

type Stage = 'local' | 'preview' | 'production'
type BucketKind = 'public' | 'raw'
type StorageLocation = 'local' | 'remote'

type CliOptions = {
  bucketKind: BucketKind
  configPath: string
  key: string
  persistTo: string
  sourceLocation: StorageLocation
  sourceStage: Stage
  targetLocation: StorageLocation
  targetStage: Stage
}

const DEFAULT_CONFIG_PATH = 'workers/asset-service/wrangler.toml'
const DEFAULT_PERSIST_TO = '.wrangler/state'

const BUCKETS: Record<BucketKind, Record<Stage, string>> = {
  raw: {
    local: 'hype-assets-raw-dev',
    preview: 'hype-assets-raw-preview',
    production: 'hype-assets-raw-prod',
  },
  public: {
    local: 'hype-assets-dev',
    preview: 'hype-assets-preview',
    production: 'hype-assets-prod',
  },
}

/**
 * Parses the sync CLI flags.
 *
 * @param argv Raw process args after the script path.
 * @returns Normalized options.
 */
const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    bucketKind: 'raw',
    configPath: DEFAULT_CONFIG_PATH,
    persistTo: DEFAULT_PERSIST_TO,
    sourceLocation: 'remote',
    sourceStage: 'production',
    targetLocation: 'local',
    targetStage: 'production',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--bucket-kind':
        options.bucketKind = argv[index + 1] as BucketKind
        index += 1
        break
      case '--config':
        options.configPath = argv[index + 1]
        index += 1
        break
      case '--key':
        options.key = argv[index + 1]
        index += 1
        break
      case '--persist-to':
        options.persistTo = argv[index + 1]
        index += 1
        break
      case '--source-location':
        options.sourceLocation = argv[index + 1] as StorageLocation
        index += 1
        break
      case '--source-stage':
        options.sourceStage = argv[index + 1] as Stage
        index += 1
        break
      case '--target-location':
        options.targetLocation = argv[index + 1] as StorageLocation
        index += 1
        break
      case '--target-stage':
        options.targetStage = argv[index + 1] as Stage
        index += 1
        break
      default:
        break
    }
  }

  const key = options.key?.trim()
  if (!key) {
    throw new Error('Missing required --key')
  }

  if (options.bucketKind !== 'raw' && options.bucketKind !== 'public') {
    throw new Error(`Invalid --bucket-kind value: ${String(options.bucketKind)}`)
  }

  if (
    options.sourceStage !== 'local' &&
    options.sourceStage !== 'preview' &&
    options.sourceStage !== 'production'
  ) {
    throw new Error(`Invalid --source-stage value: ${String(options.sourceStage)}`)
  }

  if (
    options.targetStage !== 'local' &&
    options.targetStage !== 'preview' &&
    options.targetStage !== 'production'
  ) {
    throw new Error(`Invalid --target-stage value: ${String(options.targetStage)}`)
  }

  if (options.sourceLocation !== 'local' && options.sourceLocation !== 'remote') {
    throw new Error(
      `Invalid --source-location value: ${String(options.sourceLocation)}`,
    )
  }

  if (options.targetLocation !== 'local' && options.targetLocation !== 'remote') {
    throw new Error(
      `Invalid --target-location value: ${String(options.targetLocation)}`,
    )
  }

  return {
    bucketKind: options.bucketKind,
    configPath: options.configPath ?? DEFAULT_CONFIG_PATH,
    key,
    persistTo: options.persistTo ?? DEFAULT_PERSIST_TO,
    sourceLocation: options.sourceLocation,
    sourceStage: options.sourceStage,
    targetLocation: options.targetLocation,
    targetStage: options.targetStage,
  }
}

/**
 * Resolves a bucket name from its logical kind and environment stage.
 *
 * @param bucketKind Logical bucket family.
 * @param stage Stage selector.
 * @returns Concrete bucket name.
 */
const getBucketName = (bucketKind: BucketKind, stage: Stage): string =>
  BUCKETS[bucketKind][stage]

/**
 * Builds a wrangler r2 object spec string.
 *
 * @param bucket Bucket name.
 * @param key Object key.
 * @returns Wrangler object spec.
 */
const toObjectSpec = (bucket: string, key: string): string => `${bucket}/${key}`

/**
 * Runs a wrangler command and throws on failure.
 *
 * @param args Wrangler CLI args.
 * @returns Nothing.
 */
const runWrangler = async (args: string[]): Promise<void> => {
  const proc = Bun.spawn({
    cmd: ['bunx', 'wrangler', ...args],
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`wrangler exited with code ${exitCode}`)
  }
}

/**
 * Downloads one object from the source bucket and uploads it to the target bucket.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  const sourceBucket = getBucketName(options.bucketKind, options.sourceStage)
  const targetBucket = getBucketName(options.bucketKind, options.targetStage)
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hype-r2-sync-'))
  const tempFile = path.join(
    tempDir,
    path.basename(options.key) || 'object.bin',
  )

  try {
    console.log(
      `[r2:sync] ${options.bucketKind} ${options.sourceLocation}:${options.sourceStage} -> ${options.targetLocation}:${options.targetStage}`,
    )
    console.log(`[r2:sync] key=${options.key}`)

    await runWrangler([
      'r2',
      'object',
      'get',
      toObjectSpec(sourceBucket, options.key),
      `--${options.sourceLocation}`,
      '--persist-to',
      options.persistTo,
      '--file',
      tempFile,
      '-c',
      options.configPath,
    ])

    await runWrangler([
      'r2',
      'object',
      'put',
      toObjectSpec(targetBucket, options.key),
      `--${options.targetLocation}`,
      '--persist-to',
      options.persistTo,
      '--file',
      tempFile,
      '-c',
      options.configPath,
    ])

    console.log(
      `[r2:sync] complete ${sourceBucket}/${options.key} -> ${targetBucket}/${options.key}`,
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

await main()
