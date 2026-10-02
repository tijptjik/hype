import { error, json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// HELPERS
import { requireMapRenderAccess } from '#lib/map/renders/auth.server.js'
import { getProjectMapRenderData } from '#lib/map/renders/render.server.js'
import { toMapRenderPayload } from '#lib/api/services/render.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - GET

/**
 * Returns the deterministic render payload for one project preview.
 *
 * @param event Request event carrying the project id.
 * @returns JSON render payload for the headless preview page.
 */
export const GET: RequestHandler = async ({ params, request, url, locals }) => {
  const { platform } = locals
  const projectId = params.project

  if (!projectId) {
    throw error(404, 'Project not found')
  }

  requireMapRenderAccess(request, url, platform)

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getProjectMapRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview data not found')
  }

  return json(toMapRenderPayload(renderData))
}
