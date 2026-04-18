import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Database as SQLiteDatabase } from 'bun:sqlite'

import { and, asc, eq, gt, inArray, isNotNull } from 'drizzle-orm'
import { drizzle as drizzleBunSqlite, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import {
  D1Helper,
  type BoundD1,
  type ProxyD1,
  useProxyD1,
} from '@nerdfolio/drizzle-d1-helpers'

import { ImageCDN, ImageEnv } from '../src/lib/enums'
import {
  toCloudflareImageWorkerPath,
  toImagePrerenderWorkerPaths,
  toImageRawIntermediateWorkerPath,
} from '../src/lib/images/delivery'
import { image } from '../src/lib/db/schema'

type ImageStage = `${ImageEnv}`
type DrizzleDatabase = BoundD1 | ProxyD1 | BunSQLiteDatabase
type StorageMode = 'local' | 'remote'
type DerivativeKey =
  | 'raw-intermediate'
  | 'thumb-256-webp'
  | 'thumb-256-jpeg'
  | 'thumb-128-webp'
  | 'thumb-128-jpeg'
  | 'fit-1024-webp'
  | 'fit-1024-jpeg'
type ScriptOptions = {
  dbStage: ImageStage
  dbStorage: StorageMode
  r2Stage: ImageStage
  r2Storage: StorageMode
  baseUrl: string
  batchSize: number
  concurrency: number
  max503Retries: number
  requestTimeoutMs: number
  retryAfterFallbackMs: number
  variantDelayMs: number
  derivativeKeys?: DerivativeKey[]
  rawKeys?: string[]
  targetId?: string
  limit?: number
}
type ImageRow = {
  id: string
  env: string
  cdn: string
  publicId: string
  version: number | null
}
type WarmupCounters = {
  imagesSeen: number
  imagesWarmed: number
  variantsWarmed: number
  variantsMissing: number
  variantsFailed: number
}

const DEFAULT_PRERENDER_ACCEPT =
  'image/webp,image/jpeg,image/*;q=0.9,*/*;q=0.8'
const DEFAULT_BASE_URLS: Record<ImageStage, string> = {
  local: 'http://localhost:8788',
  preview: 'https://assets.preview.hype.hk',
  production: 'https://assets.hype.hk',
}
const SUPPORTED_DERIVATIVE_KEYS = [
  'raw-intermediate',
  'thumb-256-webp',
  'thumb-256-jpeg',
  'thumb-128-webp',
  'thumb-128-jpeg',
  'fit-1024-webp',
  'fit-1024-jpeg',
] as const satisfies readonly DerivativeKey[]

const sleep = async (ms: number): Promise<void> =>
  await new Promise(resolve => setTimeout(resolve, ms))

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> =>
  await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    }),
  ])

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

const loadRemoteCredentials = async (stage: Exclude<ImageStage, 'local'>): Promise<void> => {
  if (stage === 'preview') {
    await loadEnvFile('.env.drizzle.preview.local')
    return
  }

  await loadEnvFile('.env.drizzle.prod.local')
}

const parseFlag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

const parseMultiValueFlag = (name: string): string[] => {
  const values: string[] = []

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue

    const rawValue = process.argv[index + 1]
    if (!rawValue || rawValue.startsWith('--')) {
      throw new Error(`Missing value for ${name}`)
    }

    values.push(rawValue)
  }

  return values
}

const parsePositiveIntFlag = (name: string, fallback: number): number => {
  const raw = parseFlag(name)
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected ${name} to be a positive integer, received ${raw}`)
  }

  return value
}

const parseImageStage = (value: string | undefined, flagName: string): ImageStage => {
  if (!value) {
    throw new Error(`Missing ${flagName} value`)
  }

  if (value === ImageEnv.local || value === ImageEnv.preview || value === ImageEnv.production) {
    return value
  }

  throw new Error(`Unsupported ${flagName} value: ${value}`)
}

const parseDerivativeKeys = (): DerivativeKey[] | undefined => {
  const values = parseMultiValueFlag('--derivative-key')
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)

  if (values.length === 0) {
    return undefined
  }

  const invalidValues = values.filter(
    value =>
      !SUPPORTED_DERIVATIVE_KEYS.includes(value as (typeof SUPPORTED_DERIVATIVE_KEYS)[number]),
  )
  if (invalidValues.length > 0) {
    throw new Error(
      `Unsupported --derivative-key value(s): ${invalidValues.join(', ')}. Supported keys: ${SUPPORTED_DERIVATIVE_KEYS.join(', ')}`,
    )
  }

  return [...new Set(values)] as DerivativeKey[]
}

const parseRawKeys = (): string[] | undefined => {
  const values = parseMultiValueFlag('--raw-key')
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => (value.endsWith('.raw') ? value.slice(0, -4) : value))

  if (values.length === 0) {
    return undefined
  }

  return [...new Set(values)]
}

const toRawKeyCandidates = (rawKeys: string[]): string[] =>
  [
    ...rawKeys,
    ...rawKeys
      .filter(rawKey => rawKey.startsWith('h/'))
      .map(rawKey => rawKey.slice(2))
      .filter(Boolean),
  ].filter((value, index, values) => values.indexOf(value) === index)

const parseLegacyStage = (): ImageStage | undefined => {
  const value = parseFlag('--stage')
  if (!value) return undefined
  return parseImageStage(value, '--stage')
}

const parseStorageMode = (
  params: {
    localFlag: string
    remoteFlag: string
    fallback: StorageMode
  },
): StorageMode => {
  const useLocal = process.argv.includes(params.localFlag)
  const useRemote = process.argv.includes(params.remoteFlag)

  if (useLocal && useRemote) {
    throw new Error(`Cannot use both ${params.localFlag} and ${params.remoteFlag}`)
  }

  if (useLocal) return 'local'
  if (useRemote) return 'remote'
  return params.fallback
}

const parseOptions = (): ScriptOptions => {
  const legacyStage = parseLegacyStage()
  const dbStage = parseFlag('--db-stage')
    ? parseImageStage(parseFlag('--db-stage'), '--db-stage')
    : (legacyStage ?? ImageEnv.local)
  const r2Stage = parseFlag('--r2-stage')
    ? parseImageStage(parseFlag('--r2-stage'), '--r2-stage')
    : (legacyStage ?? dbStage)
  const dbStorage = parseStorageMode({
    localFlag: '--db-local',
    remoteFlag: '--db-remote',
    fallback: legacyStage ? (legacyStage === ImageEnv.local ? 'local' : 'remote') : 'local',
  })
  const r2Storage = parseStorageMode({
    localFlag: '--r2-local',
    remoteFlag: '--r2-remote',
    fallback: legacyStage ? (legacyStage === ImageEnv.local ? 'local' : 'remote') : 'local',
  })
  const defaultBaseUrl =
    r2Storage === 'local' ? DEFAULT_BASE_URLS.local : DEFAULT_BASE_URLS[r2Stage]
  const baseUrl = (parseFlag('--base-url') ?? defaultBaseUrl).replace(/\/+$/, '')
  const batchSize = parsePositiveIntFlag('--batch-size', 50)
  const defaultConcurrency = r2Storage === 'remote' ? 1 : 2
  const concurrency = parsePositiveIntFlag('--concurrency', defaultConcurrency)
  const max503Retries = parsePositiveIntFlag(
    '--max-503-retries',
    r2Storage === 'remote' ? 20 : 4,
  )
  const requestTimeoutMs = parsePositiveIntFlag('--request-timeout-ms', 30000)
  const retryAfterFallbackMs = parsePositiveIntFlag(
    '--retry-after-fallback-ms',
    r2Storage === 'remote' ? 5000 : 2000,
  )
  const variantDelayMs = parsePositiveIntFlag('--variant-delay-ms', 250)
  const derivativeKeys = parseDerivativeKeys()
  const rawKeys = parseRawKeys()
  const targetId = parseFlag('--id')
  const limitFlag = parseFlag('--limit')
  const limit = limitFlag ? parsePositiveIntFlag('--limit', 1) : undefined

  if (rawKeys && targetId) {
    throw new Error('Cannot combine --raw-key with --id')
  }

  return {
    dbStage,
    dbStorage,
    r2Stage,
    r2Storage,
    baseUrl,
    batchSize,
    concurrency,
    max503Retries,
    requestTimeoutMs,
    retryAfterFallbackMs,
    variantDelayMs,
    ...(derivativeKeys ? { derivativeKeys } : {}),
    ...(rawKeys ? { rawKeys } : {}),
    ...(targetId ? { targetId } : {}),
    limit,
  }
}

const toDerivativePaths = (params: {
  derivativeKeys?: DerivativeKey[]
  env: ImageStage
  publicId: string
  version: number
}): string[] => {
  if (!params.derivativeKeys || params.derivativeKeys.length === 0) {
    return toImagePrerenderWorkerPaths({
      env: params.env,
      publicId: params.publicId,
      version: params.version,
    })
  }

  return params.derivativeKeys.map(key => {
    switch (key) {
      case 'raw-intermediate':
        return toImageRawIntermediateWorkerPath({
          publicId: params.publicId,
          version: params.version,
        })
      case 'thumb-256-webp':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fill,h_256,w_256',
          format: 'webp',
        })
      case 'thumb-256-jpeg':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fill,h_256,w_256',
          format: 'jpeg',
        })
      case 'thumb-128-webp':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fill,h_128,w_128',
          format: 'webp',
        })
      case 'thumb-128-jpeg':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fill,h_128,w_128',
          format: 'jpeg',
        })
      case 'fit-1024-webp':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fit,h_1024,w_1024',
          format: 'webp',
        })
      case 'fit-1024-jpeg':
        return toCloudflareImageWorkerPath({
          env: params.env,
          publicId: params.publicId,
          version: params.version,
          transformation: 'c_fit,h_1024,w_1024',
          format: 'jpeg',
        })
    }
  })
}

const fetchImageBatch = async (params: {
  db: DrizzleDatabase
  lastId?: string
  batchSize: number
  targetId?: string
  rawKeys?: string[]
}): Promise<ImageRow[]> => {
  const conditions = [
    eq(image.isArchived, false),
    isNotNull(image.publicId),
    isNotNull(image.version),
    ...(params.targetId ? [eq(image.id, params.targetId)] : []),
    ...(params.rawKeys?.length
      ? [inArray(image.publicId, toRawKeyCandidates(params.rawKeys))]
      : []),
    ...(params.lastId ? [gt(image.id, params.lastId)] : []),
  ]

  const db = params.db as any

  return (await db
    .select({
      id: image.id,
      cdn: image.cdn,
      env: image.env,
      publicId: image.publicId,
      version: image.version,
    })
    .from(image)
    .where(and(...conditions))
    .orderBy(asc(image.id))
    .limit(params.batchSize)) as ImageRow[]
}

const toNormalizedImageRow = (row: ImageRow): ImageRow => {
  const nextRow = { ...row }

  // Mirror the app's legacy image normalization so prerender picks up records
  // that still carry pre-R2 provider and env values in the database.
  if (nextRow.cdn === ImageCDN.cloudinary) {
    nextRow.cdn = ImageCDN.cloudflareR2
  }

  if (
    nextRow.env !== ImageEnv.local &&
    nextRow.env !== ImageEnv.preview &&
    nextRow.env !== ImageEnv.production
  ) {
    nextRow.env = ImageEnv.production
  }

  if (nextRow.publicId && !nextRow.publicId.startsWith('h/')) {
    nextRow.publicId = `h/${nextRow.publicId}`
  }

  return nextRow
}

const warmVariant = async (params: {
  baseUrl: string
  path: string
  timeoutMs: number
  max503Retries: number
  retryAfterFallbackMs: number
  retries?: number
}): Promise<'warmed' | 'missing'> => {
  const response = await withTimeout(
    fetch(`${params.baseUrl}${params.path}`, {
      method: 'HEAD',
      headers: {
        accept: DEFAULT_PRERENDER_ACCEPT,
      },
    }),
    params.timeoutMs,
    `Warmup timed out after ${params.timeoutMs}ms for ${params.path}`,
  )

  if (response.ok) {
    return 'warmed'
  }

  if (response.status === 404) {
    return 'missing'
  }

  if (response.status === 503 && (params.retries ?? 0) < params.max503Retries) {
    const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '')
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(retryAfterSeconds * 1000, params.retryAfterFallbackMs)
      : params.retryAfterFallbackMs
    await sleep(retryAfterMs)
    return await warmVariant({
      ...params,
      retries: (params.retries ?? 0) + 1,
    })
  }

  throw new Error(`Warmup failed with status ${response.status} for ${params.path}`)
}

const warmImageRow = async (
  row: ImageRow,
  options: ScriptOptions,
  counters: WarmupCounters,
): Promise<void> => {
  counters.imagesSeen += 1

  if (typeof row.version !== 'number') {
    return
  }

  const normalizedRow = toNormalizedImageRow(row)

  if (normalizedRow.cdn !== ImageCDN.cloudflareR2) {
    return
  }

  const paths = toDerivativePaths({
    derivativeKeys: options.derivativeKeys,
    env: options.r2Stage,
    publicId: normalizedRow.publicId,
    version: normalizedRow.version,
  })

  let imageSucceeded = true

  for (const path of paths) {
    try {
      const result = await warmVariant({
        baseUrl: options.baseUrl,
        path,
        max503Retries: options.max503Retries,
        timeoutMs: options.requestTimeoutMs,
        retryAfterFallbackMs: options.retryAfterFallbackMs,
      })

      if (result === 'missing') {
        imageSucceeded = false
        counters.variantsMissing += 1
        console.warn(`[image:prerender] Missing source for ${row.publicId} (${path})`)
        continue
      }

      counters.variantsWarmed += 1
      if (options.variantDelayMs > 0) {
        await sleep(options.variantDelayMs)
      }
    } catch (error) {
      imageSucceeded = false
      counters.variantsFailed += 1
      console.warn(
        `[image:prerender] Failed ${row.publicId} (${path}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  if (imageSucceeded) {
    counters.imagesWarmed += 1
  }

  if (counters.imagesSeen % 10 === 0) {
    console.log(
      `[image:prerender] In-flight progress ${counters.imagesSeen} images, ${counters.variantsWarmed} variants warmed, ${counters.variantsMissing} variants missing, ${counters.variantsFailed} variants failed`,
    )
  }
}

const runWithConcurrency = async (
  rows: ImageRow[],
  options: ScriptOptions,
  counters: WarmupCounters,
): Promise<void> => {
  let nextIndex = 0
  const workerCount = Math.min(options.concurrency, rows.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < rows.length) {
        const row = rows[nextIndex]
        nextIndex += 1
        await warmImageRow(row, options, counters)
      }
    }),
  )
}

const runBackfill = async (db: DrizzleDatabase, options: ScriptOptions): Promise<void> => {
  const counters: WarmupCounters = {
    imagesSeen: 0,
    imagesWarmed: 0,
    variantsWarmed: 0,
    variantsMissing: 0,
    variantsFailed: 0,
  }
  const startedAt = Date.now()
  let lastId: string | undefined

  while (true) {
    const remaining =
      typeof options.limit === 'number'
        ? options.limit - counters.imagesSeen
        : options.batchSize

    if (typeof options.limit === 'number' && remaining <= 0) {
      break
    }

    const rows = await fetchImageBatch({
      db,
      lastId,
      batchSize:
        typeof options.limit === 'number'
          ? Math.min(options.batchSize, remaining)
          : options.batchSize,
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(options.rawKeys?.length ? { rawKeys: options.rawKeys } : {}),
    })

    if (rows.length === 0) {
      break
    }

    lastId = rows.at(-1)?.id
    console.log(
      `[image:prerender] Processing batch starting at ${rows[0]?.id} (${rows.length} images)`,
    )
    await runWithConcurrency(rows, options, counters)

    console.log(
      `[image:prerender] Progress ${counters.imagesSeen} images, ${counters.variantsWarmed} variants warmed, ${counters.variantsMissing} variants missing, ${counters.variantsFailed} variants failed`,
    )
  }

  console.log(
    `[image:prerender] Complete in ${Date.now() - startedAt}ms: ${counters.imagesSeen} images seen, ${counters.imagesWarmed} fully warmed, ${counters.variantsWarmed} variants warmed, ${counters.variantsMissing} variants missing, ${counters.variantsFailed} variants failed`,
  )
}

const main = async (): Promise<void> => {
  const options = parseOptions()

  console.log(
    `[image:prerender] Starting with db=${options.dbStorage}:${options.dbStage} and r2=${options.r2Storage}:${options.r2Stage} via ${options.baseUrl} (batch=${options.batchSize}, concurrency=${options.concurrency}, timeout=${options.requestTimeoutMs}ms, max503Retries=${options.max503Retries}, retryAfterFallback=${options.retryAfterFallbackMs}ms, variantDelay=${options.variantDelayMs}ms${options.derivativeKeys?.length ? `, derivativeKeys=${options.derivativeKeys.join('|')}` : ''}${options.rawKeys?.length ? `, rawKeys=${options.rawKeys.join('|')}` : ''}${options.targetId ? `, id=${options.targetId}` : ''}${typeof options.limit === 'number' ? `, limit=${options.limit}` : ''})`,
  )

  if (options.dbStorage === 'local') {
    const helper = D1Helper.get('DB', {
      environment: options.dbStage === ImageEnv.local ? undefined : options.dbStage,
    }).withPersistTo('.wrangler/state/v3')
    const sqliteFile = helper.sqliteLocalFile

    console.log(`[image:prerender] Using local sqlite ${sqliteFile}`)

    const sqlite = new SQLiteDatabase(sqliteFile, {
      readonly: true,
      create: false,
    })

    try {
      const db = drizzleBunSqlite(sqlite)
      await runBackfill(db, options)
    } finally {
      sqlite.close()
    }
    return
  }

  if (options.dbStage === ImageEnv.local) {
    throw new Error('Remote DB access requires --db-stage preview or --db-stage production')
  }

  await loadRemoteCredentials(options.dbStage)

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_D1_TOKEN
  if (!accountId || !token) {
    throw new Error(
      `Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_D1_TOKEN for ${options.dbStage} backfill`,
    )
  }

  const helper = D1Helper.get('DB', { environment: options.dbStage })

  // drizzle-d1-helpers currently drops the requested environment in withCfCredentials().
  await useProxyD1(
    {
      accountId,
      token,
      databaseId: helper.databaseId,
    },
    async db => {
      await runBackfill(db, options)
    },
  )
}

await main()
