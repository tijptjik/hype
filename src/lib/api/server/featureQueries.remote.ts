// SVELTE
import { error } from '@sveltejs/kit'
// SCHEMA
import { z } from 'zod'
import { getResolution, isValidCell } from 'h3-js'
// API
import { guardedBatchQuery } from './guarded.js'
import {
  authorizeFeatureListForContext,
  toAuthMessage,
} from '#lib/api/services/authz/index.js'
import { toQueryConditions, toRequestedListState } from '#lib/api/services/feature.js'
// DB
import {
  buildFeaturePrismConditions,
  featureQuerySignature,
  queryFeaturePage,
} from '#lib/db/services/featureQuery.js'
// TYPES
import type {
  FeatureQueryInput,
  FeatureQueryPage,
} from '#lib/api/services/featureQuery.types.js'

const strings = z.array(z.string().min(1).max(200)).max(1000)
const range = z
  .object({
    globalMin: z.number().finite(),
    globalMax: z.number().finite(),
    rangeMin: z.number().finite(),
    rangeMax: z.number().finite(),
  })
  .refine(value => value.rangeMin <= value.rangeMax, 'Invalid property range')
const inputSchema = z.object({
  excludeIds: z.array(z.string().min(1).max(200)).max(500).optional(),
  includeCounts: z.boolean().optional(),
  sorting: z
    .object({ sortBy: z.enum(['id', 'visitedAt']), sortOrder: z.enum(['asc', 'desc']) })
    .optional(),
  q: z.string().trim().max(200).optional(),
  prisms: z
    .object({
      organisation: strings.optional(),
      project: strings.optional(),
      layer: strings.optional(),
    })
    .optional(),
  filters: z
    .object({
      properties: z
        .record(
          z.string().min(1).max(200),
          z.record(z.string().min(1).max(200), z.union([strings, range, z.boolean()])),
        )
        .optional(),
      divisionIds: strings.optional(),
      excludeDivisionIds: strings.optional(),
      list: z
        .object({
          userId: z.string().min(1).max(200).optional(),
          listId: z.enum(['wishlist', 'visited']),
        })
        .optional(),
      isVisitable: z.boolean().optional(),
      isIntangible: z.boolean().optional(),
    })
    .optional(),
  spatial: z
    .object({
      resolution: z.number().int().min(0).max(12),
      cells: z.array(z.string().max(16)).max(256),
      bounds: z
        .tuple([
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
        ])
        .optional(),
    })
    .refine(
      value =>
        value.cells.every(
          cell => isValidCell(cell) && getResolution(cell) === value.resolution,
        ),
      'Invalid H3 cell resolution',
    )
    .refine(
      value => !value.bounds || value.bounds[1] <= value.bounds[3],
      'Invalid latitude bounds',
    )
    .optional(),
  limit: z.number().int().min(1).max(250).optional(),
  cursor: z
    .object({
      id: z.string().min(1).max(200),
      signature: z.string().regex(/^[a-f0-9]{64}$/),
      value: z.string().nullable().optional(),
    })
    .nullish(),
  meta: z.object({ isAdminRequest: z.boolean(), scope: z.string().max(4096) }),
})

/**
 * Returns a bounded feature query shared by map, search, filter and user-list views.
 * @param input - Search, composable filters, optional viewport cells and traversal cursor.
 * @returns Feature records with exact query totals and server neighbourhood facets.
 * @remarks Client scope identifies cache entries only. Role, hub and private-list access
 * are independently enforced on every request, including each cursor page.
 * Native batched queries send their arguments by POST, keeping large viewport/filter
 * selections out of request URLs while preserving query retention and refresh behavior.
 */
export const getFeaturePage = guardedBatchQuery(
  inputSchema,
  async (_inputs, ctx) =>
    async (input): Promise<FeatureQueryPage> => {
      const { db, user, userRoles, event } = ctx
      // A mixed batch must never promote a public item to another item's admin scope.
      const isAdminRequest = input.meta.isAdminRequest
      const queryInput: FeatureQueryInput = input
      if (input.sorting?.sortBy === 'visitedAt' && !input.filters?.list)
        throw error(400, 'LIST_REQUIRED_FOR_VISITED_SORT')
      const signature = await featureQuerySignature(queryInput)
      if (input.cursor && input.cursor.signature !== signature)
        throw error(400, 'CURSOR_SCOPE_MISMATCH')
      const requested = { isPublished: true, isArchived: false, isDraft: false }
      const decision = authorizeFeatureListForContext({
        user,
        userRoles,
        requestedListState: toRequestedListState(requested),
        resourceHubId: event.locals.hub.id ?? null,
      })
      if (!decision.allowed)
        throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
      if (
        !event.locals.hub.isCore &&
        !event.locals.hub.code &&
        !event.locals.hub.domain
      )
        throw error(403, 'HUB_REQUIRED')

      // Saved lists use the same self/super-admin ownership rule as getUserFeatures.
      const list = input.filters?.list
      const targetUserId = list?.userId ?? user.id
      if (list && targetUserId !== user.id && !user.superAdmin)
        throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
      const { conditions } = toQueryConditions(
        db,
        user,
        isAdminRequest,
        requested,
        userRoles,
        undefined,
        event.locals.hub.id ?? null,
      )
      // Resolve prism membership at layer level so counts can share the same exact scope.
      conditions.push(...buildFeaturePrismConditions(db, input.prisms))
      const result = await queryFeaturePage(
        db,
        {
          ...queryInput,
          filters: list
            ? { ...input.filters, list: { ...list, userId: targetUserId } }
            : input.filters,
        },
        conditions,
        event.locals.hub,
        user.id,
      )
      // The public cursor binds the original input, before trusted user-list ownership enrichment.
      if (result.nextCursor) result.nextCursor.signature = signature
      return result
    },
)
