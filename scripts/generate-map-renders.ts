import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

import {
  ensureRenderServer,
  generateRenderJobsLocally,
} from '../src/lib/map/renders/local.server'
import { MAP_STYLE_RENDER_BASE_URL } from '../src/lib/map/styles/render.shared'
import type {
  MapRenderPersistenceTarget,
  MapRenderRemoteConfig,
  MapRenderJob,
  PreviewStage,
} from '../src/lib/types'

type MapRenderSubjectKind = 'styles' | 'layers' | 'projects'

const ALL_KINDS: MapRenderSubjectKind[] = ['styles', 'layers', 'projects']

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

const loadLocalEnvForStage = async (stage: PreviewStage): Promise<void> => {
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

const parseKinds = (): MapRenderSubjectKind[] => {
  const kinds = process.argv.slice(2).filter(argument => !argument.startsWith('--'))

  if (kinds.length === 0) {
    return ALL_KINDS
  }

  return kinds.filter(
    (kind): kind is MapRenderSubjectKind =>
      kind === 'styles' || kind === 'layers' || kind === 'projects',
  )
}

const main = async (): Promise<void> => {
  const storage = (parseFlag('--storage') ?? 'local') as MapRenderPersistenceTarget
  const stage = (parseFlag('--stage') ?? 'local') as PreviewStage
  const kinds = parseKinds()
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
  const baseUrl = process.env.MAP_STYLE_RENDER_BASE_URL ?? MAP_STYLE_RENDER_BASE_URL
  const sinceHours = process.env.MAP_RENDER_SINCE_HOURS ?? '24'

  const remoteConfig: MapRenderRemoteConfig | undefined =
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

  if (kinds.includes('styles')) {
    console.log(
      `[map:render] Running style render generation (${force ? 'init' : 'incremental'}, ${storage}:${stage})`,
    )

    const styleArgs = ['run', 'scripts/generate-map-style-renders.ts']
    if (storage === 'remote') {
      styleArgs.push('--storage', storage, '--stage', stage)
    }
    if (force) {
      styleArgs.push('--force')
    }

    const stylesProcess = spawn(
      'bun',
      styleArgs,
      {
        cwd: process.cwd(),
        stdio: 'inherit',
      },
    )

    const exitCode = await new Promise<number>((resolve, reject) => {
      stylesProcess.on('error', reject)
      stylesProcess.on('exit', code => resolve(code ?? 1))
    })
    if (exitCode !== 0) {
      throw new Error(`Style render generation failed with exit code ${exitCode}`)
    }
  }

  const entityKinds = kinds.filter(
    (kind): kind is Exclude<MapRenderSubjectKind, 'styles'> => kind !== 'styles',
  )

  if (entityKinds.length === 0) {
    console.log(
      `[map:render] Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    )
    return
  }

  const server = await ensureRenderServer(baseUrl)
  const requestUrl = new URL('/api/mapRenders/refresh', baseUrl)

  requestUrl.searchParams.set('mode', 'plan')
  requestUrl.searchParams.set('kinds', entityKinds.join(','))
  requestUrl.searchParams.set('sinceHours', sinceHours)
  if (force) {
    requestUrl.searchParams.set('force', 'true')
  }

  console.log(
    `[map:render] ${force ? 'Rebuilding' : 'Refreshing'} ${entityKinds.join(', ')} renders${force ? '' : ` changed in the last ${sinceHours}h`} (${storage}:${stage})`,
  )

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(
        `Map render refresh failed (${response.status} ${response.statusText}): ${await response.text()}`,
      )
    }

    const payload = (await response.json()) as {
      jobs: MapRenderJob[]
      planned: number
    }
    const generationStartedAt = Date.now()

    if (payload.jobs.length === 0) {
      console.log('[map:render] No renders required for the requested scope')
      return
    }

    console.log(
      `[map:render] Planned ${payload.planned} render jobs. Starting ${storage}:${stage} rendering...`,
    )

    const entries = await generateRenderJobsLocally(payload.jobs, {
      baseUrl,
      force,
      storage,
      stage,
      remoteConfig,
      onProgress: ({ job, index, total, stage, entry }) => {
        if (stage === 'started') {
          console.log(
            `[map:render] [${index}/${total}] Rendering ${job.kind}/${job.identifier}...`,
          )
          return
        }

        console.log(
          `[map:render] [${index}/${total}] Completed ${job.kind}/${job.identifier} -> ${entry?.publicUrl ?? job.targetObjectKey}`,
        )
      },
    })

    console.log(
      `[map:render] Done. Planned ${payload.planned}, generated ${Object.keys(entries).length} in ${((Date.now() - generationStartedAt) / 1000).toFixed(1)}s`,
    )
  } finally {
    await server.dispose()
  }

  console.log(`[map:render] Total ${(Date.now() - startedAt) / 1000}s`)
}

await main()
