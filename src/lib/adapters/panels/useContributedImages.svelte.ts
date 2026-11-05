// SVELTE
import { untrack } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
// SERVICES
import { getURLfromImage } from '#lib/client/services/image.js'
import { ImageContextResource } from '#lib/enums.js'
// TYPES
import type { UserContributionsModel } from './userContributions.js'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { ImageContextEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { ResourceContext } from '#lib/types.js'

type ContributedImage = ImageContextEnvelope['image'] & {
  featureId?: string
  href?: string
  url: string
}
type Group = {
  projectId: string
  total: number
  imageIds: string[]
  hierarchy: ResourceContext
}
type Scope = {
  id: string
  contributedImages: UserProfile['contributedImages']
  privateImages: NonNullable<UserProfile['privateContributions']>['images']
}
type ContributedImagesState = {
  readonly groups: Group[]
  readonly images: SvelteMap<string, ContributedImage>
  readonly loading: boolean
  readonly failed: boolean
  readonly hasMore: boolean
  loadMore: () => Promise<void>
}
const PAGE_SIZE = 24

/** Load photo pages without eager project hydration or per-photo authorization reads.
 * @param readUser Current profile, including owner-scoped private thumbnails.
 * @param readModel Surface-owned remote and navigation adapter.
 * @returns Loaded groups, thumbnail map and retryable continuation state.
 * @remarks Successful pages consume missing IDs too; failures never advance progress.
 */
export function useContributedImages(
  readUser: () => UserProfile,
  readModel: () => UserContributionsModel,
): ContributedImagesState {
  let groups = $state<Group[]>([])
  let images = $state(new SvelteMap<string, ContributedImage>())
  let loading = $state(false)
  let failed = $state(false)
  let cursor = $state(0)
  let total = $state(0)
  let continuePage: () => Promise<void> = async () => {}
  const currentModel = $derived(readModel())
  // Include IDs and review states; equal-count filters invalidate, username edits do not.
  const scopeKey = $derived.by(() => {
    const user = readUser()
    return JSON.stringify({
      id: user.id,
      contributedImages: user.contributedImages,
      privateImages: user.privateContributions?.images ?? {},
    } satisfies Scope)
  })
  $effect(() => {
    const scope: Scope = JSON.parse(scopeKey)
    const model = currentModel
    let active = true
    const items = Object.entries(scope.contributedImages).flatMap(([projectId, ids]) =>
      ids.map(id => ({ projectId, id })),
    )
    untrack(() => {
      groups = []
      images = new SvelteMap()
      cursor = 0
      total = items.length
      loading = false
      failed = false
    })
    /** Append a complete page atomically and ignore responses from obsolete profiles.
     * @returns Once this page has settled; existing rows survive transport failures.
     */
    async function loadPage(): Promise<void> {
      if (!active || loading || cursor >= items.length) return
      loading = true
      failed = false
      const page = items.slice(cursor, cursor + PAGE_SIZE)
      try {
        const publicIds = page
          .filter(({ id }) => !scope.privateImages[id])
          .map(({ id }) => id)
        const rows = publicIds.length ? await model.getImages(scope.id, publicIds) : []
        if (!active) return
        const nextImages = new SvelteMap(images)
        for (const row of rows) {
          nextImages.set(row.image.id, {
            ...row.image,
            featureId: row.ctxId,
            href: `/features/${row.ctxId}`,
            url: getURLfromImage({
              image: row,
              transformation: 'c_fill,h_256,w_256',
              quality: 'auto',
            }),
          })
        }
        // Personal thumbnails come from the owner-scoped profile, never the public resource cache.
        for (const { id } of page) {
          const preview = scope.privateImages[id]
          if (preview)
            nextImages.set(id, {
              ...preview.image,
              url: getURLfromImage({
                image: {
                  image: preview.image,
                  ctxType: ImageContextResource.feature,
                  ctxId: preview.featureId,
                },
                transformation: 'c_fill,h_256,w_256',
                quality: 'auto',
              }),
            })
        }
        const nextGroups = [...groups]
        // Hydrate ancestry only when a page first exposes a project, never the whole history.
        for (const projectId of new Set(page.map(item => item.projectId))) {
          const existing = groups.find(group => group.projectId === projectId)
          const imageIds = [
            ...(existing?.imageIds ?? []),
            ...page
              .filter(item => item.projectId === projectId && nextImages.has(item.id))
              .map(item => item.id),
          ].sort(
            (a, b) =>
              Date.parse(nextImages.get(b)?.createdAt ?? '') -
                Date.parse(nextImages.get(a)?.createdAt ?? '') || a.localeCompare(b),
          )
          if (!imageIds.length) continue
          const hierarchy =
            existing?.hierarchy ?? (await model.getProjectHierarchy(projectId))
          if (!active) return
          const group = {
            projectId,
            total: scope.contributedImages[projectId].length,
            imageIds,
            hierarchy,
          }
          const index = nextGroups.findIndex(group => group.projectId === projectId)
          if (index < 0) nextGroups.push(group)
          else nextGroups[index] = group
        }
        if (!active) return
        images = nextImages
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
    get images() {
      return images
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
    loadMore: () => continuePage(),
  }
}
