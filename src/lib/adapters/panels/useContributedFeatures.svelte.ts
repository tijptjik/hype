// SVELTE
import { untrack } from 'svelte'
// TYPES
import type { UserContributionsModel } from './userContributions.js'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceContext } from '#lib/types.js'

type PrivatePreview = NonNullable<
  UserProfile['privateContributions']
>['features'][string]
type Entry =
  | { kind: 'published'; id: string; createdAt: string; feature: FeatureFromCollection }
  | { kind: 'private'; id: string; createdAt: string; preview: PrivatePreview }
type Group = {
  projectId: string
  total: number
  features: FeatureFromCollection[]
  entries: Entry[]
  hierarchy: ResourceContext
}
type Scope = {
  id: string
  contributedFeatures: UserProfile['contributedFeatures']
  privateFeatures: Record<string, PrivatePreview>
}

const PAGE_SIZE = 20

type ContributedFeaturesState = {
  readonly groups: Group[]
  readonly loading: boolean
  readonly failed: boolean
  readonly hasMore: boolean
  loadMore: () => Promise<void>
}

/** Load profile contributions in bounded pages shared across all project groups.
 * @param readUser Current profile, including authorized private previews.
 * @param readModel Route-owned resource and navigation adapter.
 * @returns Reactive groups, loading/error state and an explicit continuation action.
 * @remarks Scope changes discard obsolete results and stop scheduling their remaining reads.
 */
export function useContributedFeatures(
  readUser: () => UserProfile | undefined,
  readModel: () => UserContributionsModel,
): ContributedFeaturesState {
  let groups = $state<Group[]>([])
  let loading = $state(false)
  let failed = $state(false)
  let cursor = $state(0)
  let total = $state(0)
  let continuePage: () => Promise<void> = async () => {}
  const currentModel = $derived(readModel())
  // Identity, IDs and moderation state invalidate reads; unrelated profile edits do not.
  const scopeKey = $derived.by(() => {
    const user = readUser()
    return JSON.stringify({
      id: user?.id ?? '',
      contributedFeatures: user?.contributedFeatures ?? {},
      privateFeatures: user?.privateContributions?.features ?? {},
    } satisfies Scope)
  })

  $effect(() => {
    const scope: Scope = JSON.parse(scopeKey)
    const model = currentModel
    let active = true
    const items = Object.entries(scope.contributedFeatures).flatMap(
      ([projectId, ids]) => ids.map(id => ({ projectId, id })),
    )
    untrack(() => {
      groups = []
      cursor = 0
      total = items.length
      failed = false
      loading = false
    })

    /** Append one complete page, preserving existing rows if the transport fails. */
    async function loadPage(): Promise<void> {
      if (!active || loading || cursor >= items.length) return
      loading = true
      failed = false
      const page = items.slice(cursor, cursor + PAGE_SIZE)
      const entries: Array<{ projectId: string; entry: Entry }> = []
      try {
        // One page request replaces per-feature transport and authorization waterfalls.
        const publicIds = page
          .filter(({ id }) => !scope.privateFeatures[id])
          .map(({ id }) => id)
        const features = publicIds.length
          ? await model.getFeatures(scope.id, publicIds)
          : []
        if (!active) return
        const byId = new Map(features.map(feature => [feature.id, feature]))
        for (const { projectId, id } of page) {
          const preview = scope.privateFeatures[id]
          const feature = byId.get(id)
          if (preview)
            entries.push({
              projectId,
              entry: { kind: 'private', id, createdAt: preview.createdAt, preview },
            })
          else if (feature)
            entries.push({
              projectId,
              entry: { kind: 'published', id, createdAt: feature.createdAt, feature },
            })
        }

        const nextGroups = [...groups]
        for (const projectId of new Set(page.map(item => item.projectId))) {
          if (!active) return
          const existing = groups.find(group => group.projectId === projectId)
          const combined = [
            ...(existing?.entries ?? []),
            ...entries
              .filter(item => item.projectId === projectId)
              .map(item => item.entry),
          ].sort(
            (a, b) =>
              Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
              a.id.localeCompare(b.id),
          )
          const features = combined.flatMap(entry =>
            entry.kind === 'published' ? [entry.feature] : [],
          )
          // Group labels need project ancestry, not each feature's layer graph.
          const hierarchy =
            existing?.hierarchy ?? (await model.getProjectHierarchy(projectId))
          if (!active) return
          const group = {
            projectId,
            total: scope.contributedFeatures[projectId].length,
            features,
            entries: combined,
            hierarchy,
          }
          const index = nextGroups.findIndex(item => item.projectId === projectId)
          if (index < 0) nextGroups.push(group)
          else nextGroups[index] = group
        }
        if (!active) return
        groups = nextGroups
        cursor += page.length
      } catch {
        if (active) failed = true
      } finally {
        if (active) loading = false
      }
    }

    continuePage = loadPage
    untrack(() => {
      void loadPage()
    })
    return () => {
      active = false
    }
  })

  return {
    get groups() {
      return groups
    },
    get loading() {
      return loading
    },
    get failed() {
      return failed
    },
    get hasMore() {
      return cursor < total
    },
    loadMore: (): Promise<void> => continuePage(),
  }
}
