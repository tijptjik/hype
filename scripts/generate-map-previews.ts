import { spawn } from 'node:child_process'

import {
  ensurePreviewServer,
  generatePreviewJobsLocally,
} from '../src/lib/map/previews/local.server'
import { MAP_STYLE_PREVIEW_BASE_URL } from '../src/lib/map/styles/preview.shared'
import type { PreviewRenderJob } from '../src/lib/types'

type PreviewKind = 'styles' | 'layers' | 'projects'

const ALL_KINDS: PreviewKind[] = ['styles', 'layers', 'projects']

const parseKinds = (): PreviewKind[] => {
  const kinds = process.argv.slice(2).filter(argument => !argument.startsWith('--'))

  if (kinds.length === 0) {
    return ALL_KINDS
  }

  return kinds.filter(
    (kind): kind is PreviewKind =>
      kind === 'styles' || kind === 'layers' || kind === 'projects',
  )
}

const main = async (): Promise<void> => {
  const baseUrl = process.env.MAP_STYLE_PREVIEW_BASE_URL ?? MAP_STYLE_PREVIEW_BASE_URL
  const kinds = parseKinds()
  const force = process.argv.includes('--force')
  const sinceHours = process.env.MAP_PREVIEW_SINCE_HOURS ?? '24'
  const startedAt = Date.now()

  if (kinds.includes('styles')) {
    console.log(
      `[map:preview] Running style preview generation (${force ? 'init' : 'incremental'})`,
    )

    const stylesProcess = spawn(
      'bun',
      ['run', 'scripts/generate-map-style-previews.ts', ...(force ? ['--force'] : [])],
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
      throw new Error(`Style preview generation failed with exit code ${exitCode}`)
    }
  }

  const entityKinds = kinds.filter(
    (kind): kind is Exclude<PreviewKind, 'styles'> => kind !== 'styles',
  )

  if (entityKinds.length === 0) {
    console.log(
      `[map:preview] Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    )
    return
  }

  const server = await ensurePreviewServer(baseUrl)
  const requestUrl = new URL('/api/mapPreviews/refresh', baseUrl)

  requestUrl.searchParams.set('mode', 'plan')
  requestUrl.searchParams.set('kinds', entityKinds.join(','))
  requestUrl.searchParams.set('sinceHours', sinceHours)
  if (force) {
    requestUrl.searchParams.set('force', 'true')
  }

  console.log(
    `[map:preview] ${force ? 'Rebuilding' : 'Refreshing'} ${entityKinds.join(', ')} previews${force ? '' : ` changed in the last ${sinceHours}h`}`,
  )

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(
        `Preview refresh failed (${response.status} ${response.statusText}): ${await response.text()}`,
      )
    }

    const payload = (await response.json()) as {
      jobs: PreviewRenderJob[]
      planned: number
    }
    const generationStartedAt = Date.now()

    if (payload.jobs.length === 0) {
      console.log('[map:preview] No previews required for the requested scope')
      return
    }

    console.log(
      `[map:preview] Planned ${payload.planned} preview jobs. Starting local rendering...`,
    )

    const entries = await generatePreviewJobsLocally(payload.jobs, {
      baseUrl,
      onProgress: ({ job, index, total, stage, entry }) => {
        if (stage === 'started') {
          console.log(
            `[map:preview] [${index}/${total}] Rendering ${job.kind}/${job.identifier}...`,
          )
          return
        }

        console.log(
          `[map:preview] [${index}/${total}] Completed ${job.kind}/${job.identifier} -> ${entry?.publicUrl ?? job.targetObjectKey}`,
        )
      },
    })

    console.log(
      `[map:preview] Done. Planned ${payload.planned}, generated ${Object.keys(entries).length} in ${((Date.now() - generationStartedAt) / 1000).toFixed(1)}s`,
    )
  } finally {
    await server.dispose()
  }

  console.log(`[map:preview] Total ${(Date.now() - startedAt) / 1000}s`)
}

await main()
