// DB
import {
  feature,
  hub,
  layer,
  organisation,
  project,
  task,
} from '#lib/db/schema/index.js'
// AUTHORIZATION
import { resolveAnalyticsScope } from './authz/analytics'
import { getScopedHubAdminIds, isCoreHubAdmin } from './authz/hubPolicy'
// UTILITIES
import { autochunk, chunkedInArray } from '#lib/utils/batch-query.js'
import { sharePath } from '#lib/sharing/resource.js'
// TYPES
import type { Database, UserRoleDisco } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Scope authorization and choices
// 2. Resource attribution

export type AnalyticsSelection = {
  type: 'global' | 'hub' | 'organisation' | 'project'
  id?: string
}
export type AnalyticsScopeOption = AnalyticsSelection & { label: string }
type Actor = {
  db: Database
  user: { superAdmin?: boolean | null }
  userRoles: UserRoleDisco[]
}
export type AnalyticsResources = {
  label: string
  hubIds?: string[]
  trafficScope?: { hubIds: string[]; includeCore: boolean }
  paths?: string[]
  entities?: {
    organisations: string[]
    projects: string[]
    layers: string[]
    features: string[]
    tasks: string[]
  }
}

/** Lists only scopes granted by current roles and persisted ancestry.
 * @param actor Request identity and database. @returns Authorized picker options.
 */
export async function listAnalyticsScopes(
  actor: Actor,
): Promise<AnalyticsScopeOption[]> {
  const global = Boolean(actor.user.superAdmin || isCoreHubAdmin(actor.userRoles))
  const allowed = await resolveAnalyticsScope({
    ...actor,
    requestedScope: { scopePrefixes: [], organisationIds: [], projectIds: [] },
  })
  const hubs = await actor.db.select({ id: hub.id, code: hub.code }).from(hub)
  const hubIds = getScopedHubAdminIds(actor.userRoles)
  const options: AnalyticsScopeOption[] = global
    ? [{ type: 'global', label: 'Global' }]
    : []
  options.push(
    ...hubs
      .filter(row => global || hubIds.has(row.id))
      .map(row => ({ type: 'hub' as const, id: row.id, label: `Hub · ${row.code}` })),
  )
  if (!allowed.scope) return options
  const organisations = global
    ? await actor.db
        .select({ id: organisation.id, code: organisation.code })
        .from(organisation)
    : await autochunk({ items: allowed.scope.organisationIds }, ids =>
        actor.db
          .select({ id: organisation.id, code: organisation.code })
          .from(organisation)
          .where(chunkedInArray(organisation.id, ids)),
      )
  const projects = global
    ? await actor.db.select({ id: project.id, code: project.code }).from(project)
    : await autochunk({ items: allowed.scope.projectIds }, ids =>
        actor.db
          .select({ id: project.id, code: project.code })
          .from(project)
          .where(chunkedInArray(project.id, ids)),
      )
  options.push(
    ...organisations.map(row => ({
      type: 'organisation' as const,
      id: row.id,
      label: `Organisation · ${row.code}`,
    })),
    ...projects.map(row => ({
      type: 'project' as const,
      id: row.id,
      label: `Project · ${row.code}`,
    })),
  )
  return options
}

/** Authorizes a selected scope before resolving any analytics identifiers.
 * @param actor Request identity and database. @param selection Requested picker option.
 * @returns Server-derived attribution, or null for a denied selection.
 * @remarks Current ancestry defines historical attribution; no unfiltered fallback is allowed.
 */
export async function resolveAnalyticsResources(
  actor: Actor,
  selection?: AnalyticsSelection,
): Promise<AnalyticsResources | null> {
  const options = await listAnalyticsScopes(actor)
  const selected = selection
    ? options.find(
        option => option.type === selection.type && option.id === selection.id,
      )
    : options[0]
  if (!selected) return null
  if (selected.type === 'global') return { label: selected.label }
  if (selected.type === 'hub') return { label: selected.label, hubIds: [selected.id!] }

  // Resolve descendants with bounded D1 queries, retaining archived resources for history.
  const organisations =
    selected.type === 'organisation'
      ? await actor.db
          .select({ id: organisation.id, code: organisation.code })
          .from(organisation)
          .where(chunkedInArray(organisation.id, [selected.id!]))
      : []
  const projects = await actor.db
    .select({
      id: project.id,
      code: project.code,
      organisationId: project.organisationId,
    })
    .from(project)
    .where(
      selected.type === 'project'
        ? chunkedInArray(project.id, [selected.id!])
        : chunkedInArray(project.organisationId, [selected.id!]),
    )
  // Host coverage follows the parent organisation, without granting parent analytics access.
  const parentIds = [
    ...new Set(
      selected.type === 'organisation'
        ? [selected.id!]
        : projects.map(row => row.organisationId),
    ),
  ]
  const parents = await autochunk({ items: parentIds }, ids =>
    actor.db
      .select({
        hubId: organisation.hubId,
        isCoreInclusive: organisation.isCoreInclusive,
        isHubExclusive: organisation.isHubExclusive,
      })
      .from(organisation)
      .where(chunkedInArray(organisation.id, ids)),
  )
  const trafficScope = {
    hubIds: [...new Set(parents.flatMap(row => (row.hubId ? [row.hubId] : [])))],
    includeCore: parents.some(
      row => row.isCoreInclusive && (!row.hubId || !row.isHubExclusive),
    ),
  }
  const projectIds = projects.map(row => row.id)
  const layers = await autochunk({ items: projectIds }, ids =>
    actor.db
      .select({ id: layer.id })
      .from(layer)
      .where(chunkedInArray(layer.projectId, ids)),
  )
  const features = await autochunk({ items: projectIds }, ids =>
    actor.db
      .select({ id: feature.id })
      .from(feature)
      .where(chunkedInArray(feature.projectId, ids)),
  )
  const tasks = await autochunk({ items: projectIds }, ids =>
    actor.db
      .select({ id: task.id })
      .from(task)
      .where(chunkedInArray(task.projectId, ids)),
  )
  const paths = [
    ...organisations.flatMap(row => [
      sharePath({ kind: 'organisation', ref: row.code }),
      `/organization/${encodeURIComponent(row.code)}`,
    ]),
    ...projects.map(row => sharePath({ kind: 'project', ref: row.code })),
    ...layers.map(row => sharePath({ kind: 'layer', ref: row.id })),
    ...features.map(row => sharePath({ kind: 'feature', ref: row.id })),
  ]
  return {
    label: `${selected.label} · current resource ownership`,
    trafficScope,
    paths: [...new Set(paths.flatMap(path => [path, `${path}/`]))],
    entities: {
      organisations: organisations.map(row => row.id),
      projects: projectIds,
      layers: layers.map(row => row.id),
      features: features.map(row => row.id),
      tasks: tasks.map(row => row.id),
    },
  }
}

/** Selects production domains where the authorized perspective belongs.
 * @param hubs Persisted hub identities and domains.
 * @param resources Server-authorized analytics scope and parent inclusion policy.
 * @returns Unique sorted domains; an empty membership never widens to all hubs.
 * @remarks Traffic membership is separate from Usage hub attribution so resource event filters remain intact.
 */
export function analyticsHostsForScope(
  hubs: Array<{ id: string; code: string; domain: string | null }>,
  resources: AnalyticsResources,
): string[] {
  return [
    ...new Set(
      hubs
        .filter(row => {
          if (resources.hubIds) return resources.hubIds.includes(row.id)
          if (!resources.trafficScope) return true
          return row.code === 'core'
            ? resources.trafficScope.includeCore
            : resources.trafficScope.hubIds.includes(row.id)
        })
        .map(row => row.domain?.trim().toLowerCase())
        .filter(
          (domain): domain is string =>
            Boolean(domain) && !/localhost|\.localhost$|^preview\./.test(domain ?? ''),
        ),
    ),
  ].sort()
}
