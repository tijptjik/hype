import { z } from 'zod'
import { env } from '$env/dynamic/private'
// REMOTE
import { guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// AUTHORIZATION
import { toAuthMessage } from '$lib/api/services/authz'
import { canAccessAnalytics } from '$lib/api/services/authz/user'
// SERVER
import {
  fetchAssetAnalyticsSummary,
  resolveAssetAnalyticsConfig,
} from '$lib/api/services/analytics'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getAssetAnalyticsSummary

const assetAnalyticsSummaryParamsSchema = z.object({
  scopePrefixes: z.array(z.string()).optional(),
  organisationIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

const privateEnv = env as Record<string, string | undefined>

/**
 * Loads the asset analytics summary for admin-only monitoring surfaces.
 *
 * @param _params - Remote query metadata envelope.
 * @param ctx - Guarded remote context with server auth and platform env access.
 * @returns A normalized analytics summary result.
 */
export const getAssetAnalyticsSummary = guardedQuery(
  assetAnalyticsSummaryParamsSchema,
  async (params, ctx) => {
    if (
      !ctx.isAdminRequest ||
      ctx.user.isAnonymous ||
      !canAccessAnalytics({
        superAdmin: ctx.user.superAdmin,
        userRoles: ctx.userRoles,
      })
    ) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }

    return fetchAssetAnalyticsSummary({
      ...resolveAssetAnalyticsConfig({
        environment: ctx.event.platform?.env.ENVIRONMENT,
        baseUrl: ctx.event.platform?.env.PUBLIC_ASSET_BASE_URL,
        readToken: ctx.event.platform?.env.ASSET_ANALYTICS_READ_TOKEN,
        privateReadToken: privateEnv.ASSET_ANALYTICS_READ_TOKEN,
        legacyPrivateReadToken: privateEnv.IMAGE_ANALYTICS_READ_TOKEN,
      }),
      scopePrefixes: params.scopePrefixes,
      organisationIds: params.organisationIds,
      projectIds: params.projectIds,
    })
  },
)
