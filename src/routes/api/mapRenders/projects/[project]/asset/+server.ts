import { error, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { buildMapRenderObjectKey } from '$lib/map/renders/storage.shared'
import {
  buildProjectMapRenderHash,
  getProjectMapRenderData,
} from '$lib/map/renders/render.server'
import { serveMapRenderAsset } from '$lib/api/services/render'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - GET

/**
 * Serves the current project render image from the dev asset bucket or redirects to the
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
  const renderData = await getProjectMapRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview not found')
  }

  const hash = await buildProjectMapRenderHash(renderData)
  const objectKey = buildMapRenderObjectKey({
    kind: 'projects',
    identifier: projectId,
    hash,
  })
  return await serveMapRenderAsset({
    platform,
    stage: platform?.env.ENVIRONMENT,
    kind: 'projects',
    identifier: projectId,
    hash,
    objectKey,
    notFoundMessage: 'Project preview not found',
  })
}
