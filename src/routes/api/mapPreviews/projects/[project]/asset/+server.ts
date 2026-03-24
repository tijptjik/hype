import { readFile } from 'node:fs/promises'

import { error, redirect, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { getLocalPreviewFilePath } from '$lib/map/previews/local.server'
import {
  buildPreviewObjectKey,
  resolvePreviewAssetUrl,
} from '$lib/map/previews/storage.shared'
import {
  buildProjectPreviewHash,
  getProjectPreviewRenderData,
} from '$lib/map/previews/render.server'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - GET

/**
 * Serves the current project preview image from local storage or redirects to the
 * current immutable remote asset URL.
 *
 * @param event Request event carrying the project id.
 * @returns PNG response in local development, or a redirect to the immutable asset URL.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  const projectId = params.project

  if (!projectId) {
    throw error(404, 'Project preview not found')
  }

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getProjectPreviewRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview not found')
  }

  const hash = await buildProjectPreviewHash(renderData)
  const objectKey = buildPreviewObjectKey({
    kind: 'projects',
    identifier: projectId,
    hash,
  })
  const stage = platform?.env.ENVIRONMENT

  if (stage === 'preview' || stage === 'production') {
    throw redirect(
      307,
      resolvePreviewAssetUrl(
        stage,
        {
          kind: 'projects',
          identifier: projectId,
          hash,
        },
        `/${objectKey}`,
      ),
    )
  }

  try {
    const body = await readFile(
      getLocalPreviewFilePath({
        kind: 'projects',
        identifier: projectId,
        hash,
        sourceUrl: '',
        targetObjectKey: objectKey,
      }),
    )

    return new Response(body, {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'image/png',
      },
    })
  } catch {
    throw error(404, 'Project preview not found')
  }
}
