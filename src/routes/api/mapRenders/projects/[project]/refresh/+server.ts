import { error, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '#lib/api/index.js'
import {
  authorizeProjectPublishForSubmission,
  toAuthMessage,
} from '#lib/api/services/authz/index.js'
import { getUserRoles } from '#lib/db/services/user.js'
import { probeProjectForUpdate } from '#lib/db/services/project.js'
// HELPERS
import {
  buildProjectMapRenderHash,
  getProjectMapRenderData,
} from '#lib/map/renders/render.server.js'
import { runSingleMapRenderRefresh } from '#lib/api/services/render.js'
import type { Id } from '#lib/types.js'

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
export const POST: RequestHandler = async ({ params, locals, url }) => {
  const { platform } = locals
  const projectId = params.project

  if (!projectId) {
    throw error(404, 'Project preview not found')
  }

  const { user } = await getSessionOrError(locals)

  const { db } = await getDatabaseWithoutAuth(platform)
  const probe = await probeProjectForUpdate(db, projectId as Id)

  if (!probe) {
    throw error(404, 'Project preview not found')
  }

  const userRoles = user.isAnonymous ? [] : await getUserRoles(db, user.id as Id)
  const access = authorizeProjectPublishForSubmission({
    user,
    userRoles,
    resource: probe,
  })
  if (!access.allowed) {
    throw error(403, toAuthMessage(access.code ?? 'INSUFFICIENT_ROLE'))
  }

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
