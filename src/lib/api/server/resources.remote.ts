import { getLocaleKey } from '$lib/i18n'
// SVELTE
import { error } from '@sveltejs/kit'
// SCHEMA
import { z } from 'zod'
// REMOTE
import { guardedBatchQuery, guardedQuery } from './remote'
import {
  getOrganisations,
  getOrganisationsWhichHaveLayers,
} from './organisation.remote'
import { getProjects } from './project.remote'
import { getLayers } from './layer.remote'
// TYPES
import type { PanelResource, ResourcePage } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// - getResourcePage: independent compact hierarchy pages
// - getPinnedResource: batched authorized compact identities

const resourceType = z.enum(['organisation', 'project', 'layer'])
const meta = z.object({ isAdminRequest: z.boolean(), scope: z.string().max(4096) })
const pageInput = z.object({
  type: resourceType,
  profile: z.enum(['compact', 'default']).optional(),
  sorting: z
    .object({
      sortBy: z.string().trim().min(1).max(64),
      sortOrder: z.enum(['asc', 'desc']),
    })
    .optional(),
  conditions: z
    .object({
      isPublished: z.boolean().nullable().optional(),
      isArchived: z.boolean().nullable().optional(),
    })
    .optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z
    .object({
      id: z.string(),
      signature: z.string(),
      value: z.union([z.string(), z.number(), z.null()]).optional(),
    })
    .nullish(),
  prisms: z
    .object({
      organisation: z.array(z.string()).optional(),
      project: z.array(z.string()).optional(),
      layer: z.array(z.string()).optional(),
    })
    .optional(),
  meta,
})

/**
 * Returns one compact page without requiring any ancestors to be loaded on the client.
 * @param input - Authorized view/search scope and optional matching cursor.
 * @returns Up to 25 rows and the next keyset cursor.
 * @remarks Scope is a client cache discriminator only; underlying queries authorize every read.
 */
export const getResourcePage = guardedQuery(
  pageInput,
  async (input): Promise<ResourcePage> => {
    const signature = JSON.stringify({
      type: input.type,
      profile: input.profile ?? 'compact',
      sorting: input.sorting,
      conditions: input.conditions,
      q: input.q ?? '',
      prisms: input.prisms ?? {},
      meta: input.meta,
    })
    if (input.cursor && input.cursor.signature !== signature)
      throw error(400, 'CURSOR_SCOPE_MISMATCH')
    const params = {
      conditions: {
        isArchived: input.meta.isAdminRequest
          ? (input.conditions?.isArchived ?? null)
          : false,
        isPublished: input.meta.isAdminRequest
          ? (input.conditions?.isPublished ?? null)
          : true,
      },
      prisms: input.prisms,
      pagination: {
        limit: 25,
        ...(input.cursor
          ? { afterId: input.cursor.id, afterValue: input.cursor.value }
          : {}),
      },
      sorting: input.sorting ?? { sortBy: 'id', sortOrder: 'asc' as const },
      q: input.q,
      meta: {
        isAdminRequest: input.meta.isAdminRequest,
        profile: input.profile ?? ('compact' as const),
      },
    }
    // Existing resource queries remain the single authorization and visibility boundary.
    const result =
      input.type === 'organisation'
        ? await (input.meta.isAdminRequest
            ? getOrganisations(params)
            : getOrganisationsWhichHaveLayers(params))
        : input.type === 'project'
          ? await getProjects(params)
          : await getLayers(params)
    const data = result.data as PanelResource[]
    const last = data.at(-1) as unknown as Record<string, unknown> | undefined
    const sortBy = input.sorting?.sortBy ?? 'id'
    const i18n = last?.i18n as Record<string, Record<string, unknown>> | undefined
    const rawValue = ['name', 'nameShort', 'description'].includes(sortBy)
      ? i18n?.[getLocaleKey()]?.[sortBy]
      : last?.[sortBy]
    const value =
      typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : ''

    return {
      data,
      nextCursor:
        result.hasMore && data.length
          ? { id: data[data.length - 1].id, signature, value }
          : null,
    }
  },
)

/**
 * Resolves pinned rows in bounded database batches, including IDs outside loaded pages.
 * @param inputs - Resource identities collected by SvelteKit during the same turn.
 * @returns Per-input resolver backed by authorized resource collections.
 * @remarks Partitions admin intent and resource type before querying; never ORs batch permissions.
 */
export const getPinnedResource = guardedBatchQuery(
  z.object({
    type: resourceType,
    id: z.string(),
    profile: z.enum(['compact', 'default']).optional(),
    meta,
  }),
  async inputs => {
    const rows = new Map<string, PanelResource>()
    const groups = new Map<string, typeof inputs>()
    for (const input of inputs) {
      const key = JSON.stringify([input.type, input.profile, input.meta])
      groups.set(key, [...(groups.get(key) ?? []), input])
    }
    for (const group of groups.values()) {
      const first = group[0]
      const ids = [...new Set(group.map(input => input.id))]
      // Twenty-five ID parameters leave room for authorization and hub predicates.
      for (let offset = 0; offset < ids.length; offset += 25) {
        const params = {
          conditions: {
            id: ids.slice(offset, offset + 25),
            isArchived: false,
            isPublished: first.meta.isAdminRequest ? null : true,
          },
          pagination: { limit: 25 },
          meta: {
            isAdminRequest: first.meta.isAdminRequest,
            profile: first.profile ?? ('compact' as const),
          },
        }
        const result =
          first.type === 'organisation'
            ? await getOrganisations(params)
            : first.type === 'project'
              ? await getProjects(params)
              : await getLayers(params)
        for (const row of result.data)
          rows.set(
            JSON.stringify([first.type, row.id, first.profile, first.meta]),
            row as PanelResource,
          )
      }
    }
    return input =>
      rows.get(JSON.stringify([input.type, input.id, input.profile, input.meta])) ??
      null
  },
)

/**
 * Loads only default-visible layer identities for selection rules, independently of panel pages.
 * @param input - Current authorized surface and cache scope.
 * @returns Complete default-layer identities, read in bounded keyset pages.
 */
export const getDefaultLayerResources = guardedQuery(
  z.object({ meta }),
  async input => {
    const rows: PanelResource[] = []
    let afterId: string | undefined
    while (true) {
      const result = await getLayers({
        conditions: {
          isDefaultVisible: true,
          isArchived: false,
          isPublished: input.meta.isAdminRequest ? null : true,
        },
        pagination: { limit: 250, afterId },
        sorting: { sortBy: 'id', sortOrder: 'asc' },
        meta: { isAdminRequest: input.meta.isAdminRequest, profile: 'compact' },
      })
      rows.push(...(result.data as PanelResource[]))
      if (!result.hasMore || !result.data.length) break
      afterId = result.data.at(-1)?.id
    }
    return rows
  },
)
