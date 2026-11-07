// API
import { getImageIntentOptions } from '#lib/api/image.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { ImageIntentOptions } from '#lib/images/intentOptionsCache.js'

type Context = Pick<Parameters<typeof getImageIntentOptions>[0], 'ctxType' | 'ctxId'>

/**
 * Reuses Project catalogues across task and feature viewers in the same account scope.
 * @param view Session-owned resources and already-loaded ancestry.
 * @param context Image owner used when project ancestry is not available locally.
 * @param projectId Known task project, avoiding another ancestry request.
 * @returns Effective options, fetched once until the owner or account is invalidated.
 * @remarks Cached choices are presentation only; writes validate the live server policy.
 */
export function loadImageIntentOptions(
  view: Pick<ResourceViewCtx, 'cache' | 'resources'>,
  context: Context,
  projectId?: string | null,
): Promise<ImageIntentOptions> {
  const project =
    projectId ??
    (context.ctxType === 'feature'
      ? view.cache.feature.get(context.ctxId)?.projectId
      : context.ctxType === 'task'
        ? view.cache.task.get(context.ctxId)?.projectId
        : undefined)
  const owner: Context = project ? { ctxType: 'project', ctxId: project } : context
  const meta = view.resources.queryMeta
  const key = JSON.stringify([
    meta.scope,
    meta.isAdminRequest,
    owner.ctxType,
    owner.ctxId,
  ])
  return view.resources.cache.imageIntentOptions.get(key, () =>
    refreshRemoteQuery(getImageIntentOptions({ ...owner, meta })),
  )
}
