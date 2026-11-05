// SVELTE
import { error } from '@sveltejs/kit'
// API
import { guardedQuery } from './server/guarded.js'
import { authorizeFeatureListForContext } from './services/authz/feature.js'
import { toAuthMessage } from './services/authz/index.js'
import { toQueryConditions, toRequestedListState } from './services/feature.js'
// DB
import { feature } from '#lib/db/schema/index.js'
import { getValidQueryParams as validateQueryParams } from '#lib/api/index.js'
import { queryFeatureIndex } from '#lib/db/services/featureIndex.js'
// CONTRACT
import { FeatureIndexQuerySchema } from '#lib/features/indexQuery.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// TYPES
import type { FeatureDB } from '#lib/db/zod/schema/feature.types.js'

/** Read a filtered admin page and its optional exact count through one query contract.
 * @param input Prism, local view filters, search and page controls.
 * @returns Authorized rows, exact total on initial reads, and continuation metadata.
 * @remarks Filters only narrow the server-authorized set; client metadata never grants access.
 */
export const getFeatureIndexPage = guardedQuery(
  FeatureIndexQuerySchema,
  async (input, ctx) => {
    const { db, user, userRoles, isAdminRequest, event } = ctx
    if (user.isAnonymous || !isAdminRequest) throw error(403, 'ACCOUNT_REQUIRED')
    const requested = validateQueryParams<FeatureDB>(
      feature,
      input.conditions as Partial<FeatureDB> | undefined,
    )
    const decision = authorizeFeatureListForContext({
      user,
      userRoles,
      requestedListState: toRequestedListState(requested as Partial<FeatureDB>),
      resourceHubId: event.locals.hub.id ?? null,
    })
    if (!decision.allowed)
      throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
    const { conditions } = toQueryConditions(
      db,
      user,
      isAdminRequest,
      requested,
      userRoles,
      input.prisms as never,
      event.locals.hub.id ?? null,
    )
    return queryFeatureIndex(db, input, conditions, event.locals.hub, getLocale())
  },
)
