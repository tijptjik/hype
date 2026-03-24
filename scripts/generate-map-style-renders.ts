import { listMapStyleDefinitions } from '../src/lib/map/styles'
import { generateAllMapStyleRendersLocally } from '../src/lib/map/styles/render.local.server'
import { MAP_STYLE_RENDER_BASE_URL } from '../src/lib/map/styles/render.shared'
import { existsSync } from 'node:fs'

type MapRenderStorageTarget = 'local' | 'remote'
type MapRenderStage = 'local' | 'preview' | 'production'

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

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

const loadLocalEnvForStage = async (stage: MapRenderStage): Promise<void> => {
  await loadEnvFile('.dev.vars')

  if (stage === 'production') {
    await loadEnvFile('.dev.vars.production')
    return
  }

  if (stage === 'preview') {
    await loadEnvFile('.dev.vars.preview')
  }
}

const parseFlag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

const main = async (): Promise<void> => {
  const storage = (parseFlag('--storage') ?? 'local') as MapRenderStorageTarget
  const stage = (parseFlag('--stage') ?? 'local') as MapRenderStage
  const baseUrl = process.env.MAP_STYLE_RENDER_BASE_URL ?? MAP_STYLE_RENDER_BASE_URL
  const styleCodes = shuffle(
    listMapStyleDefinitions().map(definition => definition.key),
  )
  const force = process.argv.includes('--force')
  const startedAt = Date.now()

  if (storage !== 'local' && storage !== 'remote') {
    throw new Error(`Unsupported --storage value: ${storage}`)
  }

  if (stage !== 'local' && stage !== 'preview' && stage !== 'production') {
    throw new Error(`Unsupported --stage value: ${stage}`)
  }

  if (storage === 'remote' && stage === 'local') {
    throw new Error('Remote mapRender persistence requires --stage preview or --stage production')
  }

  await loadLocalEnvForStage(stage)

  const remoteConfig =
    storage === 'remote'
      ? {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
          accessKeyId: process.env.R2_S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY ?? '',
        }
      : undefined

  if (
    storage === 'remote' &&
    (!remoteConfig?.accountId ||
      !remoteConfig.accessKeyId ||
      !remoteConfig.secretAccessKey)
  ) {
    throw new Error(
      'Remote mapRender persistence requires CLOUDFLARE_ACCOUNT_ID, R2_S3_ACCESS_KEY_ID, and R2_S3_SECRET_ACCESS_KEY',
    )
  }

  console.log(
    `[map:styles:render] ${force ? 'Rebuilding' : 'Refreshing'} ${styleCodes.length} map style renders from ${baseUrl} (${storage}:${stage})`,
  )
  console.log(`[map:styles:render] Order: ${styleCodes.join(', ')}`)

  const renders = await generateAllMapStyleRendersLocally(styleCodes, {
    baseUrl,
    ensureArtifacts: true,
    force,
    storage,
    stage,
    remoteConfig,
    onProgress: ({ styleCode, index, total, stage, entry }) => {
      if (stage === 'started') {
        console.log(`[map:styles:render] [${index}/${total}] Rendering ${styleCode}...`)
        return
      }

      console.log(
        `[map:styles:render] [${index}/${total}] Completed ${styleCode} -> ${entry?.objectKey ?? 'unknown'}`,
      )
    },
  })

  console.log(
    `[map:styles:render] Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${Object.keys(renders).length} renders)`,
  )
}

await main()
