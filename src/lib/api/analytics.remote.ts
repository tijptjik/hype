import { z } from 'zod'
import { FormBoolean } from '#lib/db/zod/form.js'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
import { error } from '@sveltejs/kit'
// AUTHORIZATION
import { resolveAnalyticsScope, toAuthMessage } from '#lib/api/services/authz/index.js'
import { canAccessAnalytics } from '#lib/api/services/authz/user.js'
// SERVER
import {
  fetchAssetAnalyticsSummary,
  resolveAssetAnalyticsConfig,
} from '#lib/api/services/analytics.js'

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
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

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
    if (ctx.user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    if (
      !ctx.isAdminRequest ||
      !canAccessAnalytics({
        superAdmin: ctx.user.superAdmin,
        userRoles: ctx.userRoles,
      })
    ) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }

    const scope = await resolveAnalyticsScope({
      db: ctx.db,
      user: ctx.user,
      userRoles: ctx.userRoles,
      requestedScope: {
        scopePrefixes: params.scopePrefixes ?? [],
        organisationIds: params.organisationIds ?? [],
        projectIds: params.projectIds ?? [],
      },
    })
    if (!scope.allowed || !scope.scope) {
      throw error(403, toAuthMessage(scope.code ?? 'INSUFFICIENT_ROLE'))
    }

    return fetchAssetAnalyticsSummary({
      ...resolveAssetAnalyticsConfig({
        environment: ctx.event.locals.platform?.env.ENVIRONMENT,
        baseUrl: ctx.event.locals.platform?.env.PUBLIC_ASSET_BASE_URL,
        readToken: ctx.event.locals.platform?.env.ASSET_ANALYTICS_READ_TOKEN,
        privateReadToken: ctx.event.locals.platform?.env.ASSET_ANALYTICS_READ_TOKEN,
        legacyPrivateReadToken:
          ctx.event.locals.platform?.env.IMAGE_ANALYTICS_READ_TOKEN,
      }),
      scopePrefixes: scope.scope.scopePrefixes,
      organisationIds: scope.scope.organisationIds,
      projectIds: scope.scope.projectIds,
    })
  },
)
