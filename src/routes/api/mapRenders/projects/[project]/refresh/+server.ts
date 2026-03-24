import { error, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '$lib/api'
// HELPERS
import {
  buildProjectMapRenderHash,
  getProjectMapRenderData,
} from '$lib/map/renders/render.server'
import { runSingleMapRenderRefresh } from '$lib/api/services/render'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - POST

/**
 * Rebuilds or enqueues regeneration for one project map preview.
 *
 * @param event Request event carrying the target project id.
 * @returns JSON summary of the refresh action.
 */
export const POST: RequestHandler = async ({ params, platform, locals, url }) => {
  const projectId = params.project

  if (!projectId) {
    throw error(404, 'Project preview not found')
  }

  await getSessionOrError(locals)

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getProjectMapRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview not found')
  }

  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_RENDER_TOKEN ?? null
  const hash = await buildProjectMapRenderHash(renderData)
  return await runSingleMapRenderRefresh({
    platform,
    publicOrigin,
    stage: platform?.env.ENVIRONMENT,
    kind: 'projects',
    identifier: projectId,
    hash,
    renderToken,
  })
}
